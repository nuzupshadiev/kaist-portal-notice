import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import credentials from './credentials.js';
import {LocalStorage} from 'node-localstorage';
const sheetId = '1leT0uuabipyv1MrSa90zfHZ_hMhgIVe4HSO2hxNd_wE';
const serviceAccountAuth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});
const token = '6865393313:AAGde_XCohrYs2GvIYuqKFVjmJRHJhAMdG8';
const international_url = 'https://portal.kaist.ac.kr/board/list.brd?boardId=International';
const student_notice_url = 'https://portal.kaist.ac.kr/board/list.brd?boardId=student_notice';
const internship_notice_url = 'https://portal.kaist.ac.kr/board/list.brd?boardId=leadership_intern_counseling&lang_knd=en'
const apiUrl = 'https://api.openai.com/v1/chat/completions';
const openaiApiKey = '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'; // Replace with your 
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${openaiApiKey}`,
};

const bot = new TelegramBot(token, {polling: true});
const localstorage = new LocalStorage('./scratch');
let previousPosts = [];
let chatIds = [];

function loadPostsFromLocalStorage() {
  const previousPostsFromLS = localstorage.getItem('previousPosts');
  if (previousPostsFromLS) {
    previousPosts = JSON.parse(previousPostsFromLS);
  }
}
function writeToLocalStorage(data) {
  previousPosts.push(...data);
  localstorage.setItem('previousPosts', JSON.stringify(previousPosts));
  console.log('previousPosts written to local storage successfully.');
}
function isDuplicate(obj1, obj2) {
  return (
    obj1.title === obj2.title &&
    obj1.link === obj2.link &&
    obj1.date === obj2.date
  );
}
async function loadChatIdsFromGoogleSheets() {
  let doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
  try {
    await doc.loadInfo();
    let sheet = doc.sheetsByIndex[0];
    await sheet.loadCells();
    const rows = await sheet.getRows();
    const newChatIds = rows.map((row) => {
      return row._rawData[6];
    });
    chatIds = newChatIds;
  } catch (err) {
    console.error('Error loading chatIds from Google Sheets:', err.message);
  }
}
async function writeToGoogleSheets(data) {
  const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);
  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    await sheet.loadCells();
    const rows = await sheet.getRows();
    const isDataExists = rows.some((row) => {
      return row.name === data.name;
    });
    if (isDataExists) {
      console.log('Similar data already exists. Skipping write to Google Sheets.');
    } else {
      chatIds.push(data.chatId);
      await sheet.addRow(data);
      console.log('Data written to Google Sheets successfully.');
    }
  } catch (err) {
    console.error('Error writing to Google Sheets:', err.message);
  }
}
function extractPosts(html) {
  const $ = cheerio.load(html);
  const posts = [];
  $('.req_tbl_01 tbody tr').each((index, element) => {
      const titleElement = $(element).find('.req_tit a');
      const title = titleElement.text().trim();
      const link = titleElement.attr('href');
      const date = $(element).find('td:last-child label').text().trim();
      posts.push({
          title,
          link,
          date,
      });
  });
  return posts.reverse();
}

function sendNotification(message, chatId, retryCount = 0) {
  const escapedString = message
  try {
    bot.sendMessage(chatId, escapedString, { parse_mode: "Markdown" })
      .then((response) => {
        console.log("Message sent");
      })
      .catch((error) => {
        console.error(error);
        if (retryCount > 0) {
          console.log(`Retrying... (${retryCount} attempts left)`);
          sendNotification(message, chatId, retryCount - 1);
        } else {
          console.error("Maximum retries reached. Notification not sent.");
        }
      });
  } catch (error) {
    console.error("An unexpected error occurred:", error);
  }
}

function SendNotificationEveryone(message){
  for(const chatId of chatIds){
    bot.sendMessage(Number(chatId), message, { parse_mode: 'Markdown' })
    .catch((error) => {
      console.error(`SendNotificationEveryone error: ${error.message}`);
    });
  }
}

function checkForNewPosts() {
  axios.get(international_url).then((response)=>{
    const html = response.data;
    const currentPosts = extractPosts(html);
    if (currentPosts.length > 0) {
        const newPosts = currentPosts.filter(currentPost =>
          !previousPosts.some(previousPost => isDuplicate(currentPost, previousPost))
        );
        if (newPosts.length > 0) {
          for (const post of newPosts) {
            SendNotificationEveryone(`New post from International Community:\n*${post.title}*\n(https://portal.kaist.ac.kr${post.link})\n${post.date}`);
          }
          writeToLocalStorage(newPosts);
        }
    }
  })
  .catch((err)=>console.error(err))
}

function checkStartPosts(chatId) {
  axios.get(international_url).then((response)=>{
    const html = response.data;
    const currentPosts = extractPosts(html);
    if (currentPosts.length > 0) {
        const startIdx = Math.max(0, currentPosts.length - 5);
        for (let i = startIdx; i < currentPosts.length; i++) {
          const post = currentPosts[i];
          sendNotification(`New post from International Community:\n*${post.title}*\n(https://portal.kaist.ac.kr${post.link})\n${post.date}`, chatId);
        }
    }
  })
  .catch((err)=>console.error(err))
}

bot.onText(/\/echo (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const resp = match[1];
  bot.sendMessage(chatId, resp);
});

loadChatIdsFromGoogleSheets();
loadPostsFromLocalStorage()

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  if (!chatIds.includes(chatId.toString())) {
    let name = `${user.first_name} ${user.last_name}`;
    const greetingMessage = `Hello ${name}! Welcome to KAIST International Portal Bot! You will be notified of any new posts from the portal. Thank you for joining our bot!`;
    bot.sendMessage(chatId, greetingMessage)
    .then(() => {})
    .catch((error) => {
      console.error(`sendNotification error: ${error.message}`);
    })
    let newData = user
    newData['chatId'] = chatId
    writeToGoogleSheets(newData);
  }
  if (msg.text && msg.text.toLowerCase() === '/start') {
    checkStartPosts(chatId)
  }
  else if (msg.text && msg.text.toLowerCase() === '/help') {
    bot.sendMessage(chatId, 'Please contact @everforgetmenot for any questions.')
    .then(() => {console.log('help message sent')})
    .catch((error) => {
      console.error(`sendNotification error: ${error.message}`);
    })
  }
  else bot.sendMessage(chatId, 'If you have any questions, please contact @everforgetmenot')
  .then(() => {console.log('help message sent')})
  .catch((error) => {
    console.error(`sendNotification error: ${error.message}`);
  })
});

setInterval(() => {
  checkForNewPosts();
}, 60000);
