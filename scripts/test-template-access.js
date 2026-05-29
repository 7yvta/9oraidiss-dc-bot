require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log('Testing template command access...');
  
  // Check original server access
  const originalServer = client.guilds.cache.get('1479255758561480906');
  if (!originalServer) {
    console.error('❌ Original server (1479255758561480906) not found');
  } else {
    console.log('✅ Original server found:', originalServer.name);
    
    // Fetch server data
    await originalServer.fetch();
    await originalServer.roles.fetch();
    await originalServer.channels.fetch();
    
    const categories = originalServer.channels.cache.filter(c => c.type === 4).size;
    const roles = originalServer.roles.cache.filter(r => r.id !== originalServer.id).size;
    const channels = originalServer.channels.cache.filter(c => c.type !== 4).size;
    
    console.log(`📊 Original server structure: ${categories} categories, ${channels} channels, ${roles} roles`);
  }
  
  // Check new server access
  const newServer = client.guilds.cache.get('1499536419960520704');
  if (!newServer) {
    console.error('❌ New server (1499536419960520704) not found');
  } else {
    console.log('✅ New server found:', newServer.name);
  }
  
  // Test template command logic
  if (originalServer && newServer) {
    console.log('✅ Template command should work - both servers accessible');
    console.log('🚀 Ready to run /template confirm:true in new server');
  } else {
    console.log('❌ Template command will fail - server access issue');
  }
  
  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN);
