const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    DO $migration$
    DECLARE
      target RECORD;
      canonical_constraint RECORD;
      duplicate_constraint RECORD;
      duplicate_index RECORD;
      column_number SMALLINT;
    BEGIN
      FOR target IN
        SELECT *
        FROM (VALUES
          ('users', 'email', 'users_email_key'),
          ('products', 'name', 'products_name_key'),
          ('tiktok_channels', 'username', 'tiktok_channels_username_key'),
          ('tiktok_channels', 'tiktok_open_id', 'tiktok_channels_tiktok_open_id_key')
        ) AS targets(table_name, column_name, canonical_name)
      LOOP
        SELECT attribute.attnum
        INTO column_number
        FROM pg_attribute attribute
        WHERE attribute.attrelid = target.table_name::regclass
          AND attribute.attname = target.column_name
          AND NOT attribute.attisdropped;

        IF column_number IS NULL THEN
          RAISE EXCEPTION
            'Cannot clean duplicate indexes: column %.% is missing',
            target.table_name,
            target.column_name;
        END IF;

        SELECT
          constraint_row.oid AS constraint_oid,
          constraint_row.conindid AS index_oid,
          index_row.*
        INTO canonical_constraint
        FROM pg_constraint constraint_row
        JOIN pg_index index_row ON index_row.indexrelid = constraint_row.conindid
        WHERE constraint_row.conrelid = target.table_name::regclass
          AND constraint_row.conname = target.canonical_name
          AND constraint_row.contype = 'u'
          AND constraint_row.conkey = ARRAY[column_number]::smallint[]
          AND index_row.indisunique
          AND index_row.indisvalid
          AND index_row.indisready;

        IF canonical_constraint.constraint_oid IS NULL THEN
          RAISE EXCEPTION
            'Cannot clean duplicate indexes: canonical unique constraint % is missing or invalid',
            target.canonical_name;
        END IF;

        FOR duplicate_constraint IN
          SELECT
            constraint_row.conname,
            constraint_row.conindid AS index_oid
          FROM pg_constraint constraint_row
          JOIN pg_index candidate_index
            ON candidate_index.indexrelid = constraint_row.conindid
          WHERE constraint_row.conrelid = target.table_name::regclass
            AND constraint_row.contype = 'u'
            AND constraint_row.oid <> canonical_constraint.constraint_oid
            AND candidate_index.indisunique
            AND candidate_index.indisvalid
            AND candidate_index.indisready
            AND candidate_index.indkey = canonical_constraint.indkey
            AND candidate_index.indclass = canonical_constraint.indclass
            AND candidate_index.indcollation = canonical_constraint.indcollation
            AND candidate_index.indoption = canonical_constraint.indoption
            AND candidate_index.indexprs IS NOT DISTINCT FROM canonical_constraint.indexprs
            AND candidate_index.indpred IS NOT DISTINCT FROM canonical_constraint.indpred
        LOOP
          IF duplicate_constraint.conname !~ ('^' || target.canonical_name || '[0-9]+$') THEN
            RAISE EXCEPTION
              'Cannot clean duplicate indexes: equivalent constraint % has an unexpected name',
              duplicate_constraint.conname;
          END IF;

          IF EXISTS (
            SELECT 1
            FROM pg_constraint dependency
            WHERE dependency.contype = 'f'
              AND dependency.conindid = duplicate_constraint.index_oid
          ) THEN
            RAISE EXCEPTION
              'Cannot drop constraint % because a foreign key depends on it',
              duplicate_constraint.conname;
          END IF;

          EXECUTE format(
            'ALTER TABLE %I DROP CONSTRAINT %I',
            target.table_name,
            duplicate_constraint.conname
          );
        END LOOP;

        -- Normally the duplicates are constraint-backed and are removed above.
        -- Also clean an equivalent standalone unique index if a previous schema
        -- tool created one with the same numeric suffix.
        FOR duplicate_index IN
          SELECT candidate_class.relname AS index_name
          FROM pg_index candidate_index
          JOIN pg_class candidate_class
            ON candidate_class.oid = candidate_index.indexrelid
          LEFT JOIN pg_constraint owner_constraint
            ON owner_constraint.conindid = candidate_index.indexrelid
          WHERE candidate_index.indrelid = target.table_name::regclass
            AND candidate_index.indexrelid <> canonical_constraint.index_oid
            AND owner_constraint.oid IS NULL
            AND candidate_index.indisunique
            AND candidate_index.indisvalid
            AND candidate_index.indisready
            AND candidate_index.indkey = canonical_constraint.indkey
            AND candidate_index.indclass = canonical_constraint.indclass
            AND candidate_index.indcollation = canonical_constraint.indcollation
            AND candidate_index.indoption = canonical_constraint.indoption
            AND candidate_index.indexprs IS NOT DISTINCT FROM canonical_constraint.indexprs
            AND candidate_index.indpred IS NOT DISTINCT FROM canonical_constraint.indpred
        LOOP
          IF duplicate_index.index_name !~ ('^' || target.canonical_name || '[0-9]+$') THEN
            RAISE EXCEPTION
              'Cannot clean duplicate indexes: equivalent standalone index % has an unexpected name',
              duplicate_index.index_name;
          END IF;

          EXECUTE format('DROP INDEX %I', duplicate_index.index_name);
        END LOOP;
      END LOOP;
    END
    $migration$;
  `, { transaction });
};

// The canonical unique constraints preserve the complete data contract. A
// rollback must not recreate redundant indexes and restore the performance bug.
const down = async () => {};

module.exports = { name: '067_cleanup_duplicate_unique_indexes', up, down };
