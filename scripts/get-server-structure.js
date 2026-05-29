require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log('Fetching server structure...');
  
  const guild = client.guilds.cache.get('1479255758561480906'); // Your current server ID
  if (!guild) {
    console.error('Guild not found');
    process.exit(1);
  }

  // Fetch all data
  await guild.fetch();
  await guild.roles.fetch();
  await guild.channels.fetch();

  const structure = {
    name: guild.name,
    categories: [],
    roles: [],
    channels: []
  };

  // Get categories and their channels
  const categories = guild.channels.cache.filter(c => c.type === 4); // 4 = GUILD_CATEGORY
  for (const category of categories.values()) {
    const categoryData = {
      name: category.name,
      position: category.position,
      channels: []
    };

    // Get channels in this category
    const categoryChannels = guild.channels.cache.filter(c => c.parentId === category.id);
    for (const channel of categoryChannels.values()) {
      categoryData.channels.push({
        name: channel.name,
        type: channel.type,
        topic: channel.topic || '',
        position: channel.position,
        nsfw: channel.nsfw || false,
        rateLimitPerUser: channel.rateLimitPerUser || 0
      });
    }

    structure.categories.push(categoryData);
  }

  // Get roles (excluding @everyone)
  const roles = guild.roles.cache.filter(r => r.id !== guild.id);
  for (const role of roles.values()) {
    structure.roles.push({
      name: role.name,
      color: role.color,
      position: role.position,
      permissions: role.permissions.bitfield.toString(),
      mentionable: role.mentionable,
      hoist: role.hoist,
      managed: role.managed
    });
  }

  // Sort roles by position (highest first)
  structure.roles.sort((a, b) => b.position - a.position);

  // Sort categories by position
  structure.categories.sort((a, b) => a.position - b.position);

  // Generate the updated template command
  const templateCode = generateTemplateCommand(structure);
  
  // Save to file
  const fs = require('fs');
  fs.writeFileSync('src/commands/utility/template.js', templateCode);
  
  console.log('✅ Template command updated with exact server structure!');
  console.log(`📊 Found ${structure.categories.length} categories, ${structure.roles.length} roles`);
  console.log('🚀 Redeploy commands with: npm run deploy:commands');
  
  client.destroy();
  process.exit(0);
});

function generateTemplateCommand(structure) {
  return `const {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const { buildResultEmbed } = require("../../utils/logger");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("template")
    .setDescription("Create an exact replica of the original server structure")
    .setDMPermission(false)
    .addBooleanOption(option =>
      option
        .setName("confirm")
        .setDescription("Type 'true' to confirm server template creation")
        .setRequired(true)
    ),

  async execute(interaction) {
    const confirm = interaction.options.getBoolean("confirm");
    
    if (!confirm) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Template Creation Cancelled",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You must set confirm to 'true' to create the server template."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Check if user has admin permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        embeds: [
          buildResultEmbed({
            title: "Permission Denied",
            color: 0xed4245,
            fields: [
              {
                name: "Reason",
                value: "You need Administrator permissions to use this command."
              }
            ]
          })
        ],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const guild = interaction.guild;
      const results = [];

      // Server template configuration (exact copy from original server)
      const template = {
        categories: ${JSON.stringify(structure.categories, null, 6)},
        roles: ${JSON.stringify(structure.roles, null, 6)}
      };

      // Create categories and channels
      for (const categoryData of template.categories) {
        try {
          // Check if category already exists
          const existingCategory = guild.channels.cache.find(c => 
            c.type === ChannelType.GuildCategory && c.name === categoryData.name
          );

          let category;
          if (existingCategory) {
            category = existingCategory;
            results.push(\`✅ Category "\${categoryData.name}" already exists\`);
          } else {
            category = await guild.channels.create({
              name: categoryData.name,
              type: ChannelType.GuildCategory,
              position: categoryData.position
            });
            results.push(\`✅ Created category: \${categoryData.name}\`);
          }

          // Create channels in this category
          for (const channelData of categoryData.channels) {
            try {
              // Check if channel already exists
              const existingChannel = guild.channels.cache.find(c => 
                c.name === channelData.name && c.parentId === category.id
              );

              if (existingChannel) {
                results.push(\`✅ Channel "\${channelData.name}" already exists\`);
                continue;
              }

              const channel = await guild.channels.create({
                name: channelData.name,
                type: channelData.type,
                topic: channelData.topic,
                parent: category.id,
                position: channelData.position,
                nsfw: channelData.nsfw,
                rateLimitPerUser: channelData.rateLimitPerUser,
                permissionOverwrites: [
                  {
                    id: guild.roles.everyone.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                  }
                ]
              });
              results.push(\`✅ Created channel: \${channelData.name}\`);
            } catch (channelError) {
              results.push(\`❌ Failed to create channel "\${channelData.name}": \${channelError.message}\`);
            }
          }
        } catch (categoryError) {
          results.push(\`❌ Failed to create category "\${categoryData.name}": \${categoryError.message}\`);
        }
      }

      // Create roles
      for (const roleData of template.roles) {
        try {
          // Check if role already exists
          const existingRole = guild.roles.cache.find(r => r.name === roleData.name);

          if (existingRole) {
            results.push(\`✅ Role "\${roleData.name}" already exists\`);
            continue;
          }

          const role = await guild.roles.create({
            name: roleData.name,
            color: roleData.color,
            position: roleData.position,
            permissions: BigInt(roleData.permissions),
            mentionable: roleData.mentionable,
            hoist: roleData.hoist
          });
          results.push(\`✅ Created role: \${roleData.name}\`);
        } catch (roleError) {
          results.push(\`❌ Failed to create role "\${roleData.name}": \${roleError.message}\`);
        }
      }

      // Create success embed
      const embed = new EmbedBuilder()
        .setTitle("🎉 Exact Server Template Created!")
        .setColor(0x57f287)
        .setDescription("Your server has been set up with the exact structure from the original server.")
        .addFields(
          {
            name: "📊 Summary",
            value: \`• \${template.categories.length} Categories\n• \${template.categories.reduce((acc, cat) => acc + cat.channels.length, 0)} Channels\n• \${template.roles.length} Roles\`,
            inline: true
          },
          {
            name: "🔧 Next Steps",
            value: "1. Assign roles to members\\n2. Use /ticketpanel in ticket-panel channel\\n3. Configure bot settings in dashboard",
            inline: true
          }
        )
        .setTimestamp();

      // Show detailed results
      const resultsText = results.slice(0, 20).join('\\n'); // Limit to first 20 results
      if (results.length > 20) {
        resultsText += \`\\n... and \${results.length - 20} more results\`;
      }

      await interaction.editReply({
        embeds: [embed],
        content: \`**Creation Results:**\\n\\\`\\\`\\\`\\n\${resultsText}\\n\\\`\\\`\\\`\`
      });

    } catch (error) {
      console.error("Template creation error:", error);
      await interaction.editReply({
        embeds: [
          buildResultEmbed({
            title: "Template Creation Failed",
            color: 0xed4245,
            fields: [
              {
                name: "Error",
                value: error.message
              },
              {
                name: "Troubleshooting",
                value: "• Ensure bot has Administrator permissions\\n• Check if channels/roles already exist\\n• Try running the command again"
              }
            ]
          })
        ]
      });
    }
  }
};`;
}

client.login(process.env.TOKEN);
