const express = require('express');
// const fetch = require('node-fetch');

// Import necessary discord.js items
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');

// --- Environment Variables (Will be set in Render) ---
const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const CLIENT_ID_42 = process.env.CLIENT_ID; // Your 42 App Client ID
const CLIENT_SECRET = process.env.CLIENT_SECRET; // Your 42 App Client Secret
const REDIRECT_URI = process.env.REDIRECT_URI; 
const APP_ID = process.env.APP_ID; // Discord Application ID

// Initialize Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// --- Register /verify command (copied from old index.js) ---
const registerCommands = async () => {
    const commands = [
        {
          name: 'verify',
          description: 'Verify your student status through 42 Intra',
        },
    ];

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('🔄 Registering slash command...');
        await rest.put(
            Routes.applicationGuildCommands(APP_ID, GUILD_ID), 
            { body: commands }
        );
        console.log('✅ Slash command registered.');
    } catch (err) {
        console.error('Error registering command:', err);
    }
};

// --- Discord Ready Event (copied from old index.js) ---
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Call register commands after logging in
    await registerCommands(); 

    // Logic to send the verification button in the channel
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(CHANNEL_ID);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify with 42')
                .setStyle(ButtonStyle.Link)
                .setURL(
                    `https://api.intra.42.fr/oauth/authorize?client_id=${CLIENT_ID_42}&redirect_uri=${encodeURIComponent(
                        REDIRECT_URI
                    )}&response_type=code`
                )
        );

        await channel.send({
            content: 'Click the button below to verify your student status:',
            components: [row],
        });
    } catch (error) {
        console.error('Error setting up verification button:', error);
    }
});


// --- Express Server Setup (The Web Component) ---
const app = express();
const PORT = process.env.PORT || 3000;

// Root route (optional)
app.get('/', (req, res) => {
    // This is the URL UptimeRobot will ping!
    res.send('42 Verification Bot is running!'); 
});

// OAuth callback route (exact same as your original server.js)
// OAuth callback route
app.get('/callback', async (req, res) => {
    const code = req.query.code;

    if (!code) {
        // IMPORTANT: Add state validation here if 42 supports it!
        return res.status(400).send('No code provided in query.');
    }

    // Exchange code for access token
    try {
        const tokenResponse = await fetch('https://api.intra.42.fr/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: CLIENT_ID_42, // Use the 42 ID variable
                client_secret: CLIENT_SECRET,
                code,
                redirect_uri: REDIRECT_URI,
            }),
        });

        // --- NEW TROUBLESHOOTING LOGIC START ---
        const tokenData = await tokenResponse.json();

        if (!tokenResponse.ok) {
            // Log the HTTP status and the error payload from 42 API
            console.error('--- 42 API ERROR RESPONSE ---');
            console.error('HTTP Status:', tokenResponse.status);
            console.error('Error Payload:', tokenData);
            console.error('-----------------------------');
            
            // Send a helpful message back to the user
            return res.status(500).send(`Verification failed: Error Status ${tokenResponse.status}. Please inform the server admin.`);
        }
        // --- NEW TROUBLESHOOTING LOGIC END ---

        console.log('Token exchange successful. Token Data:', tokenData);

        // Your verification logic (e.g., getting user info from 42 API) goes here!

        res.send('Verification successful! You can close this tab.');
    } catch (err) {
        console.error('--- CRITICAL UNCAUGHT ERROR ---');
        console.error('Error Type:', err.name || 'Unknown');
        console.error('Error Message:', err.message || 'No message provided');
        console.error('Full Error Object:', err); // Log the entire object
        console.error('-----------------------------');
        
        // This sends the error message to the browser, helping you debug if needed
        res.status(500).send(`An unexpected server error occurred: ${err.message || 'Check Server Logs'}`);
    }
});

// --- Start BOTH services (Discord & Web Server) ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}. Starting Discord client...`);
    // CRITICAL: Listen on '0.0.0.0' for Render/Docker to see it
    client.login(TOKEN); // Start the Discord bot login
});
