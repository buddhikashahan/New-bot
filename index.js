const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const https = require('https');

const url = 'https://cjtedu.com';
const sessionDataPath = 'session';
const databasePath = './database.json';
const imagesPath = 'images/';

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: sessionDataPath
    })
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
    const database = JSON.parse(fs.readFileSync(databasePath));

setInterval(async () => {
        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const latestArticleLink = $('div > div > div.pad.read-details.color-tp-pad > div.read-title > h4 > a').attr('href');
            const articleId = latestArticleLink.replace('https://cjtedu.com/archives/', '')
            if (database.includes(articleId)) {
                console.log('Article link already in the database. Skipping...');
                return;
            } else {
                console.log('New article detected. Processing...');
                const articleResponse = await axios.get(latestArticleLink);
                const $article = cheerio.load(articleResponse.data);

                const title = $article('div.entry-content-wrap.read-single > div.entry-content-title-featured-wrap > header > div > div > h1').text().trim();
                const description = $article('.read-details p').map((i, el) => $(el).text().trim()).get().join('\n\n');
                const img = $article('.read-details img').attr('src');
                const imageLinks = [];

                $article('.post-body img').each(function () {
                    imageLinks.push($(this).attr('src'));
                });

                const imageUrl = img;
                const downloadPath = imagesPath + img.replaceAll("/", "-");

                const downloadImage = (url, path) => {
                    return new Promise((resolve, reject) => {
                        https.get(url, (response) => {
                            if (response.statusCode === 200) {
                                const fileStream = fs.createWriteStream(path);
                                response.pipe(fileStream);
                                fileStream.on('finish', () => resolve(path));
                                fileStream.on('error', reject);
                            } else {
                                reject(new Error(`Error downloading image: ${response.statusCode}`));
                            }
                        }).on('error', reject);
                    });
                };

                try {
                    await downloadImage(imageUrl, downloadPath);
                    database.push(articleId);
                    fs.writeFileSync(databasePath, JSON.stringify(database));
                    const media = MessageMedia.fromFilePath(downloadPath);
                    await client.sendMessage('94766866297@s.whatsapp.net', media, { caption: `*${title}*\n\n${description}` });
                    console.log('Image with caption sent successfully!');
                    fs.unlinkSync(downloadPath);
                    console.log('Image deleted successfully');
                } catch (error) {
                    console.error('Error processing image:', error);
                }
            }
            
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    }, 10000);
});

client.on('message', (message) => {
    console.log(message.body);

    if (message.body == '!ping') {
        message.reply('pong');
    }

    if (message.body == '!jid') {
        message.reply(message.from);
    }
});

client.initialize();
