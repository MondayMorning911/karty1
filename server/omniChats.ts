import express from 'express';
// import { db } from './firebaseAdmin'; 
// import { makeWASocket } from '@whiskeysockets/baileys';
// import { TelegramClient } from 'telegram';
// import { StringSession } from 'telegram/sessions';

const router = express.Router();

/**
 * ==========================================
 * FIRESTORE DATABASE ARCHITECTURE (Firebase)
 * ==========================================
 * 
 * Collection: "omnichannel_chats"
 * 
 * Document structure:
 * {
 *   chat_id: string; (e.g. "wa_995555123456", "tg_123456789")
 *   client_phone: string;
 *   client_name: string;
 *   manager_id: string; (references a Manager document)
 *   platform: "whatsapp" | "telegram";
 *   unread: boolean; (true if client's last message is unread)
 *   last_message_text: string;
 *   last_message_timestamp: timestamp;
 *   created_at: timestamp;
 * }
 * 
 * Subcollection: "messages" (inside each chat document)
 * 
 * Document structure:
 * {
 *   id: string; (auto-generated or message ID from WA/TG)
 *   sender: "client" | "manager";
 *   text: string;
 *   timestamp: timestamp;
 *   read: boolean;
 *   media_url?: string;
 * }
 * 
 * Collection: "managers"
 * {
 *   id: string;
 *   name: string;
 *   login: string;
 *   telegram_chat_id: string; (for push notifications)
 *   active: boolean;
 * }
 */


/**
 * ==========================================
 * UNKILLABLE NOTIFICATION SYSTEM
 * ==========================================
 * 
 * Background job that runs every minute to check for unread messages older than 2 minutes.
 * If found, pushes a notification to the manager's personal Telegram.
 */
async function checkUnreadAndNotify() {
    console.log('[Omnichannel] Checking for unread messages > 2 minutes...');
    // const twoMinsAgo = Timestamp.fromMillis(Date.now() - 2 * 60 * 1000);
    // const snapshot = await db.collection('omnichannel_chats')
    //    .where('unread', '==', true)
    //    .where('last_message_timestamp', '<', twoMinsAgo)
    //    .get();
    
    // snapshot.forEach(doc => {
    //    const chat = doc.data();
    //    const managerSnapshot = await db.collection('managers').doc(chat.manager_id).get();
    //    const manager = managerSnapshot.data();
    //    
    //    if (manager?.telegram_chat_id) {
    //        const deepLink = `https://crm.karty.ge/chats?client_id=${chat.chat_id}&platform=${chat.platform}`;
    //        const text = `🔔 Новое сообщение в ${chat.platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'}!\n\nОт: ${chat.client_name}\nТекст: ${chat.last_message_text}\n\n👉 [Ответить в CRM](${deepLink})`;
    //        
    //        await bot.sendMessage(manager.telegram_chat_id, text, { parse_mode: 'Markdown' });
    //        
    //        // Mark as notified to avoid spamming
    //        await doc.ref.update({ notified: true });
    //    }
    // });
}

/**
 * ==========================================
 * SENDING MESSAGES
 * ==========================================
 */
router.post('/send', async (req, res) => {
    const { chat_id, text, manager_id } = req.body;
    
    try {
        /*
        const chatRef = db.collection('omnichannel_chats').doc(chat_id);
        const chatDoc = await chatRef.get();
        const chat = chatDoc.data();

        if (chat.platform === 'whatsapp') {
            // Using Baileys to send message
            // await waSocket.sendMessage(chat.client_phone + '@s.whatsapp.net', { text });
        } else if (chat.platform === 'telegram') {
            // Using GramJS/Telethon to send message
            // await tgClient.sendMessage(chat.client_phone, { message: text });
        }

        // Add to Firestore messages
        await chatRef.collection('messages').add({
            sender: 'manager',
            text,
            timestamp: FieldValue.serverTimestamp(),
            read: true
        });

        // Update last message in chat document
        await chatRef.update({
            last_message_text: text,
            last_message_timestamp: FieldValue.serverTimestamp(),
            unread: false
        });
        */

        res.json({ success: true });
    } catch (error) {
        console.error('[Omnichannel] Send error', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

/**
 * ==========================================
 * WEBHOOK INCOMING (From Baileys / GramJS Event Listeners)
 * ==========================================
 */
export async function handleIncomingMessage(platform: 'whatsapp' | 'telegram', phone: string, name: string, text: string) {
    /*
    const chatId = `${platform === 'whatsapp' ? 'wa' : 'tg'}_${phone}`;
    const chatRef = db.collection('omnichannel_chats').doc(chatId);
    const chatDoc = await chatRef.get();

    if (!chatDoc.exists) {
        // Create new unassigned chat or round-robin to managers
        await chatRef.set({
            chat_id: chatId,
            client_phone: phone,
            client_name: name,
            manager_id: 'pending', // To be picked up
            platform,
            unread: true,
            last_message_text: text,
            last_message_timestamp: FieldValue.serverTimestamp(),
            created_at: FieldValue.serverTimestamp()
        });
    } else {
        await chatRef.update({
            unread: true,
            notified: false, // reset notification state
            last_message_text: text,
            last_message_timestamp: FieldValue.serverTimestamp()
        });
    }

    await chatRef.collection('messages').add({
        sender: 'client',
        text,
        timestamp: FieldValue.serverTimestamp(),
        read: false
    });
    */
}

export default router;
