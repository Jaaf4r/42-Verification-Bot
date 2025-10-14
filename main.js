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

const verificationStates = new Map();

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


    // Keep only the successful verification button sending logic, 
    // but modify the button to be an Action Button
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const channel = await guild.channels.fetch(CHANNEL_ID);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Start Verification') // Changed label
                .setStyle(ButtonStyle.Secondary) // Changed style from Link to Secondary
                .setCustomId('start_42_verification') // CRITICAL: Added Custom ID
        );

        await channel.send({
            content: 'Click the button below to start the verification process:',
            components: [row],
        });
    } catch (error) {
        console.error('Error setting up permanent verification button:', error);
    }

});

// Register the Interaction Listener
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand() || interaction.commandName !== 'verify') return;
    
    // --- Step 1: Generate Secure State ---
    const discordUserId = interaction.user.id;
    // Create a simple, random state value
    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    // 2. Save the state linked to the user's Discord ID for later lookup
    verificationStates.set(state, discordUserId);

    // 3. Construct the 42 OAuth URL with the 'state' appended
    const authUrl = 
        `https://api.intra.42.fr/oauth/authorize?client_id=${CLIENT_ID_42}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&state=${state}`; // <-- Include the state

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Verify with 42')
            .setStyle(ButtonStyle.Link)
            .setURL(authUrl)
    );

    await interaction.reply({
        content: 'Click the button below to verify your student status:',
        components: [row],
        ephemeral: true // Only the user who ran the command can see this
    });
});


// New Interaction Listener for the permanent button click
client.on('interactionCreate', async (interaction) => {
    // Check if it's the custom button we just created
    if (interaction.isButton() && interaction.customId === 'start_42_verification') {
        
        // Use the exact same logic as the slash command handler
        const discordUserId = interaction.user.id;
        const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
        verificationStates.set(state, discordUserId);

        const authUrl = 
            `https://api.intra.42.fr/oauth/authorize?client_id=${CLIENT_ID_42}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&response_type=code` +
            `&state=${state}`; 
        
        // Send the secure link privately to the user who clicked the button
        const linkRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Verify with 42 Intra')
                .setStyle(ButtonStyle.Link)
                .setURL(authUrl)
        );

        await interaction.reply({
            content: 'Click the link button below to complete verification:',
            components: [linkRow],
            ephemeral: true // Only the user who clicked sees this private message
        });
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

// OAuth callback route
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const state = req.query.state; // Get the state parameter

    // --- Step 1: Validate State and Retrieve User ID ---
    const discordUserId = verificationStates.get(state);

    if (!discordUserId) {
        // If state is missing or doesn't match a stored session, it's a security failure
        return res.status(401).send('Verification failed: Invalid or missing security state. Try running /verify again in Discord.');
    }
    
    // Clean up the stored state immediately after use
    verificationStates.delete(state);

    if (!code) {
        return res.status(400).send('No authorization code provided.');
    }

    // --- Step 2: Exchange Code for Access Token (Your Existing Logic) ---
    try {
        const tokenResponse = await fetch('https://api.intra.42.fr/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: CLIENT_ID_42, 
                client_secret: CLIENT_SECRET,
                code,
                redirect_uri: REDIRECT_URI,
                // Note: The 'state' is not strictly required in the token exchange POST body, but is used for security validation in Step 1.
            }),
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) {
            console.error('42 API ERROR:', tokenData);
            return res.status(500).send(`Verification failed. Error: ${tokenData.error_description || 'API Error'}`);
        }
        
        const accessToken = tokenData.access_token;

        // --- Step 3: Fetch Student Data (Get Proof of Status) ---
        const userDataResponse = await fetch('https://api.intra.42.fr/v2/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const userData = await userDataResponse.json();

        // **CRITICAL: Add your student status check here**
        // e.g., if (userData.status === 'alumni') return res.status(403).send('Verification failed: You are no longer an active student.');

        
        // --- Step 4: Grant Role on Discord ---
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
            console.error(`Guild not found: ${GUILD_ID}`);
            return res.status(500).send('Verification error: Discord server not found.');
        }

        const member = await guild.members.fetch(discordUserId);
        
        const memberRoleId = process.env.MEMBER_ROLE_ID;
        const newcomerRoleId = process.env.NEWCOMER_ROLE_ID; 

        // 4.1. Add the new role
        await member.roles.add(memberRoleId);
        
        // 4.2. Remove the old role (Safely)
        // Check if the member actually has the role before attempting removal
        if (member.roles.cache.has(newcomerRoleId)) {
            await member.roles.remove(newcomerRoleId);
        }
        
        // Send a direct message confirmation
        member.send(`✅ Verification complete! Welcome to the student channels. Your old role has been updated.`);


        // Final successful response to the user's browser
        res.send('Verification successful! You can close this tab and check Discord.');

    } catch (err) {
        console.error('Uncaught Error in /callback:', err);
        res.status(500).send('An unexpected server error occurred. Check Discord for details.');
    }
});

// --- Start BOTH services (Discord & Web Server) ---
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}. Starting Discord client...`);
    // CRITICAL: Listen on '0.0.0.0' for Render/Docker to see it
    client.login(TOKEN); // Start the Discord bot login
});
