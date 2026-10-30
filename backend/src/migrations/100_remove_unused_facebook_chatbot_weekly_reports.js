const facebookChatbotTables = require('./005_add_facebook_chatbot_tables');
const chatbotSettings = require('./006_add_chatbot_settings');
const facebookPageAvatar = require('./009_add_facebook_page_avatar_url');
const weeklyReportSharing = require('./039_add_weekly_report_public_sharing');

const up = async ({ sequelize, transaction }) => {
  // Drop these together so internal foreign keys are removed, while RESTRICT
  // prevents deleting dependencies outside this retired feature set.
  await sequelize.query(`
    DROP TABLE IF EXISTS
      chatbot_messages,
      chatbot_settings,
      chatbot_orders,
      chatbot_knowledge_docs,
      facebook_pages,
      facebook_user_sessions,
      facebook_oauth_states,
      weekly_reports
    RESTRICT
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  // Rollback restores the schema only. Recover deleted rows from the backup
  // made by the migration runner before applying this migration.
  const context = { sequelize, transaction };
  await facebookChatbotTables.up(context);
  await chatbotSettings.up(context);
  await facebookPageAvatar.up(context);
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS weekly_reports (
      id SERIAL PRIMARY KEY,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      generated_content TEXT NOT NULL
    )
  `, { transaction });
  await weeklyReportSharing.up(context);
};

module.exports = { name: '100_remove_unused_facebook_chatbot_weekly_reports', up, down };
