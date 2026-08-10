const up = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS whatsapp_orders, whatsapp_messages CASCADE', { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id SERIAL PRIMARY KEY,
      sender_id VARCHAR(255) NOT NULL,
      phone_number_id VARCHAR(255) NOT NULL,
      display_name VARCHAR(255),
      direction VARCHAR(16) NOT NULL,
      text TEXT NOT NULL,
      via VARCHAR(32) NOT NULL DEFAULT 'system',
      external_message_id VARCHAR(255) UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_orders (
      id SERIAL PRIMARY KEY,
      sender_id VARCHAR(255) NOT NULL,
      phone_number_id VARCHAR(255) NOT NULL,
      raw TEXT NOT NULL,
      name VARCHAR(255),
      phone VARCHAR(64),
      address TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'new',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS whatsapp_messages_sender_created_idx ON whatsapp_messages(sender_id, created_at)', { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS whatsapp_messages_phone_created_idx ON whatsapp_messages(phone_number_id, created_at)', { transaction });
  await sequelize.query('CREATE INDEX IF NOT EXISTS whatsapp_orders_status_created_idx ON whatsapp_orders(status, created_at)', { transaction });
};

module.exports = { name: '059_remove_whatsapp', up, down };
