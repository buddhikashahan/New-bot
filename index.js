const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const https = require('https');
const channel = "120363258762549017@newsletter"
const url = 'https://cjtedu.com';
const sessionDataPath = 'session';
const databasePath = './database.json';
const imagesPath = 'images/';
const prefix = '.'
const database = JSON.parse(fs.readFileSync(databasePath));

async function processArticle(articleUrl) {
    try {
        // Fetch the specified article
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const articleResponse = await axios.get(articleUrl);
        const $article = cheerio.load(articleResponse.data);

        const title = $article('div.entry-content-wrap.read-single > div.entry-content-title-featured-wrap > header > div > div > h1').text().trim();
        const description = $article('.read-details p').map((i, el) => $(el).text().trim()).get().join('\n\n');
        const img = $article('.read-details img').attr('src');
        const imageLinks = [];
        const article = articleUrl.replace('https://cjtedu.com/archives/', '')
        $article('.wp-block-image img').each(function () {
            imageLinks.push($(this).attr('src'));
        });

        return {
            title,
            description,
            img,
            imageLinks,
            article
        };
    } catch (error) {
        console.error('Error processing article:', error);
        throw new Error('Error processing the article.');
    }
}

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

async function processImage(img, imagesPath) {
    const imageUrl = img;
    const downloadPath = imagesPath + img.replaceAll("/", "-");

    try {
        await downloadImage(imageUrl, downloadPath);
        return downloadPath;
    } catch (error) {
        console.error('Error downloading image:', error);
        throw new Error('Error downloading the image.');
    }
}

const client = new Client({
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2409.0.html',
    },
    authStrategy: new LocalAuth({
        dataPath: sessionDataPath
    })
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
    setInterval(async () => {
        try {
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const latestArticleLink = $('div > div > div.pad.read-details.color-tp-pad > div.read-title > h4 > a').attr('href');
            const articleId = latestArticleLink.replace('https://cjtedu.com/archives/', '');

            if (database.includes(articleId)) {
                console.log('Article link already in the database. Skipping...');
                return;
            } else {
                console.log('New article detected. Processing...');

                try {
                    const articleData = await processArticle(latestArticleLink);
                    const imagePath = await processImage(articleData.img, imagesPath);
                    database.push(articleData.article);
                    fs.writeFileSync(databasePath, JSON.stringify(database));
                    const media = MessageMedia.fromFilePath(imagePath);
                    await client.sendMessage(channel, media, {
                        caption: `*${articleData.title}*\n\n${articleData.description}`
                    });
                    console.log('Image with caption sent successfully!');
                    fs.unlinkSync(imagePath);
                    console.log('Image deleted successfully');
                    const remainingImages = articleData.imageLinks.slice(1);
                    for (const imageLink of remainingImages) {
                        const imageFilePath = await processImage(imageLink, imagesPath);
                        const imageMedia = MessageMedia.fromFilePath(imageFilePath);
                        await client.sendMessage(channel, imageMedia);
                        console.log('Image sent successfully:', imageFilePath);
                        fs.unlinkSync(imageFilePath);
                        console.log('Image deleted successfully');
                    }
                } catch (error) {
                    console.error('Error processing image:', error);
                }
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    }, 60000);
});

client.on('message', (message) => {
    const body = message.body
    const isCmd = body.startsWith(prefix)
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : ''
    const args = body.trim().split(/ +/).slice(1);
    const q = args.join(' ')
    switch (command) {
        case 'ping':
            message.reply('pong');
            break;

        case 'jid':
            message.reply(message.from);
            break;

        case 'send':
            async function sendArticle() {
                try {
                    const articleData = await processArticle(q);
                    if (!database.includes(articleData.article)) {
                        const imagePath = await processImage(articleData.img, imagesPath);
                        database.push(articleData.article);
                        fs.writeFileSync(databasePath, JSON.stringify(database));
                        const media = MessageMedia.fromFilePath(imagePath);
                        await client.sendMessage(channel, media, {
                            caption: `*${articleData.title}*\n\n${articleData.description}`
                        });
                        console.log('Image with caption sent successfully!');
                        fs.unlinkSync(imagePath);
                        console.log('Image deleted successfully');
                        const remainingImages = articleData.imageLinks.slice(1);
                    for (const imageLink of remainingImages) {
                        const imageFilePath = await processImage(imageLink, imagesPath);
                        const imageMedia = MessageMedia.fromFilePath(imageFilePath);
                        await client.sendMessage(channel, imageMedia);
                        console.log('Image sent successfully:', imageFilePath);
                        fs.unlinkSync(imageFilePath);
                        console.log('Image deleted successfully');
                    }
                    } else {
                        message.reply("This article has already been sent!");
                    }
                } catch (error) {
                    console.error('Error processing image:', error);
                }
            }
            sendArticle();

            break;

        default:

            break;
    }

});

client.initialize();
