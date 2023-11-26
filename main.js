const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cheerio = require('cheerio');

const token = '6574074066:AAGvuyuTekYgnyPsI_1QjM9cRxiXWzn7CkI';
const CHAT_ID = '778315062';
const HTML_URL = 'https://portal.kaist.ac.kr/board/list.brd?boardId=International';

const bot = new TelegramBot(token, {polling: true});
const previousPosts = [];

function isDuplicate(obj1, obj2) {
  return (
    obj1.title === obj2.title &&
    obj1.link === obj2.link &&
    obj1.date === obj2.date
  );
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

  // Sort posts by the latest date
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));

  return posts;
}

function sendNotification(message) {
  bot.sendMessage(CHAT_ID, message, { parse_mode: 'Markdown' })
    .catch((error) => {
      console.error(`Telegram API error: ${error.message}`);
    });
}

function checkForNewPosts() {
  axios.get(HTML_URL).then((response)=>{
    const html = response.data;
    const currentPosts = extractPosts(html);
    if (currentPosts.length > 0) {
        const newPosts = currentPosts.filter(currentPost =>
          !previousPosts.some(previousPost => isDuplicate(currentPost, previousPost))
        );
        if (newPosts.length > 0) {
          for (const post of newPosts) {
            sendNotification(`New post:\n*${post.title}*\n(https://portal.kaist.ac.kr/${post.link})\n${post.date}`);
          }
          previousPosts.push(...newPosts);
        }
    }
  })
  .catch((err)=>console.error(err))
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
  // send a message to the chat acknowledging receipt of their message
  bot.sendMessage(chatId, 'Мен сүйлөй албайм. Сизге билдирүү гана жөнөтө алам. Эгер кандайдыр бир көйгөй болсо, Нүзүпкө жазыңыз.');
});

setInterval(() => {
  checkForNewPosts();
}, 60000);