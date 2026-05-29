// Bot invitation URL generator
function generateBotInviteUrl() {
  const clientId = process.env.CLIENT_ID;
  
  if (!clientId) {
    console.error('❌ CLIENT_ID not found in .env file');
    process.exit(1);
  }

  // Required permissions for the bot
  const permissions = [
    'Administrator', // Easiest - gives all needed permissions
    // Alternative specific permissions:
    // 'ManageChannels',
    // 'ManageMessages', 
    // 'ManageRoles',
    // 'KickMembers',
    // 'BanMembers',
    // 'SendMessages',
    // 'EmbedLinks',
    // 'AttachFiles',
    // 'ReadMessageHistory',
    // 'AddReactions',
    // 'UseExternalEmojis',
    // 'Connect', // Voice
    // 'Speak',    // Voice
    // 'MuteMembers', // Voice
    // 'DeafenMembers' // Voice
  ];

  const scopes = ['bot', 'applications.commands'];
  
  const baseUrl = 'https://discord.com/oauth2/authorize';
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: permissions.join(','),
    scope: scopes.join(' ')
  });

  const inviteUrl = `${baseUrl}?${params.toString()}`;
  
  console.log('🔗 Bot Invitation URL:');
  console.log(inviteUrl);
  console.log('\n📋 Instructions:');
  console.log('1. Copy the URL above');
  console.log('2. Paste it in your browser');
  console.log('3. Select your new server from the dropdown');
  console.log('4. Click "Authorize"');
  console.log('5. Complete the CAPTCHA if required');
  console.log('6. The bot will join your server');
  
  return inviteUrl;
}

generateBotInviteUrl();
