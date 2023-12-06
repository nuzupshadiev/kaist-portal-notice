import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import credentials from './credentials.js';
const sheetId = '1leT0uuabipyv1MrSa90zfHZ_hMhgIVe4HSO2hxNd_wE';
const serviceAccountAuth = new JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
  ],
});
const token = '6574074066:AAFj5_XQsRiTMqLweKO8tQjXPETdRI2kI4s';
const international_url = 'https://portal.kaist.ac.kr/board/list.brd?boardId=International';
const student_notice_url = 'https://portal.kaist.ac.kr/board/list.brd?boardId=student_notice';
const apiUrl = 'https://api.openai.com/v1/chat/completions';
const openaiApiKey = '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'; // Replace with your 
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${openaiApiKey}`,
};

const bot = new TelegramBot(token, {polling: true});
const previousPosts = [];

const chatIds = [];

function isDuplicate(obj1, obj2) {
  return (
    obj1.title === obj2.title &&
    obj1.link === obj2.link &&
    obj1.date === obj2.date
  );
}
async function writeToGoogleSheets(data) {
  const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);

  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow(data);
    console.log('Data written to Google Sheets successfully.');
  } catch (err) {
    console.error('Error writing to Google Sheets:', err.message);
  }
}
async function queryUserIds() {
  const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);

  try {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    await sheet.loadCells();

    const numRows = sheet.rowCount;
    const userIds = [];

    for (let i = 1; i < numRows; i++) {
      const cell = sheet.getCell(i, 6);
      userIds.push(cell.value);
    }

    return userIds;
  } catch (err) {
    console.error('Error querying Google Sheets:', err.message);
    throw err;
  }
}

// function handleTranslate(text) {
//   return new Promise((resolve, reject) => {
//     let requestData = {
//       model: 'gpt-3.5-turbo',
//       messages: [
//         { role: 'system', content: 'You will be provided with a Korean text. Please translate it to English.' },
//       ],
//       temperature: 0,
//       max_tokens: 256,
//     };
//     requestData.messages.push({ role: 'user', content: text });

//     return axios.post(apiUrl, requestData, { headers })
//     .then(response => {
//       resolve(response.data.choices[0].message.content)
//     })
//     .catch(error => {
//       console.error('Error:', error.response ? error.response.data : error.message);
//       reject(error);
//     });
//   })
// }

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

  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  return posts;
}

function sendNotification(message, chatId, retryCount = 3) {
  try {
    bot.sendMessage(chatId, message, { parse_mode: "Markdown" })
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
    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
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
          previousPosts.push(...newPosts);
        }
    }
  })
  .catch((err)=>console.error(err))

  // axios.get(student_notice_url)
  // .then((response)=>{
  //   const html = response.data;
  //   const currentPosts = extractPosts(html);
  //   if (currentPosts.length > 0) {
  //       const newPosts = currentPosts.filter(currentPost =>
  //         !previousPosts.some(previousPost => isDuplicate(currentPost, previousPost))
  //       );
  //       if (newPosts.length > 0) {
  //         for (const post of newPosts) {
  //           SendNotificationEveryone(`New post from Student Notice:\n*${post.title}*\n(https://portal.kaist.ac.kr${post.link})\n${post.date}`);
  //         }
  //         previousPosts.push(...newPosts);
  //       }
  //   }
  // })
  // .catch((err)=>console.error(err))
}

function checkStartPosts(chatId) {
  axios.get(international_url).then((response)=>{
    const html = response.data;
    const currentPosts = extractPosts(html);
    if (currentPosts.length > 0) {
        for(let i = 0; i < Math.min(5, currentPosts.length); i++){
          const post = currentPosts[i]
          sendNotification(`New post from International Community:\n*${post.title}*\n(https://portal.kaist.ac.kr${post.link})\n${post.date}`, chatId);
        }
    }
  })
  .catch((err)=>console.error(err))

  // axios.get(student_notice_url).then((response)=>{
  //   const html = response.data;
  //   const currentPosts = extractPosts(html);
  //   if (currentPosts.length > 0) {
  //       for(let i = 0; i < Math.min(5, currentPosts.length); i++){
  //         const post = currentPosts[i]
  //         sendNotification(`New post from International Community:\n*${post.title}*\n(https://portal.kaist.ac.kr${post.link})\n${post.date}`, chatId);
  //       }
  //   }
  // })
  // .catch((err)=>console.error(err))

}
// Matches "/echo [whatever]"
bot.onText(/\/echo (.+)/, (msg, match) => {

  const chatId = msg.chat.id;
  const resp = match[1]; // the captured "whatever"

  // send back the matched "whatever" to the chat
  bot.sendMessage(chatId, resp);
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  // send a message to the chat acknowledging receipt of their message
  if (!chatIds.includes(chatId)) {
    queryUserIds()
    .then(idsss => {
      console.log('List of userIds:', idsss);
    })
    .catch(error => {
      console.error('Error:', error.message);
    });
    chatIds.push(chatId);
    let userData = user
    userData['chatId'] = chatId
    let name = `${user.first_name} ${user.last_name}`;
    const greetingMessage = `Hello ${name}! Welcome to KAIST International Portal Bot! You will be notified of any new posts from the portal. Thank you for joining our bot!`;
    bot.sendMessage(chatId, greetingMessage)
    .then(() => {})
    .catch((error) => {
      console.error(`sendNotification error: ${error.message}`);
    })
    writeToGoogleSheets(userData)
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
  else if(msg.text === 'Салам' || msg.text === 'салам' || msg.text === 'Салам алейкум' || msg.text === 'салам алейкум'){
    bot.sendMessage(chatId, 'Ваалейкум салам')
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
