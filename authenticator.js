const cheerio = require('cheerio');
const axios = require('axios');
const puppeteer = require('puppeteer');

module.exports = {
    async authenticate() {
        const browser = await puppeteer.launch({
            timeout: 120000,
            slowMo: 200,
            headless: true,
            // executablePath: '/usr/bin/chromium-browser',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        try {
            const page = await browser.newPage();
            await inputPersonalData(page);
    
            await page.waitFor('#select-service-container');
            await page.click('.service-info-container.ServiceClass .details');
            await page.waitFor('#schedule-service-container');
            await page.click('#nextBtn');
            
            try {
                await page.waitFor('#search-appointment-form');
            } catch (err) {
                const content = await page.content();
                console.log('Couldn\'t load search appointment form. The content is: ');
                console.log(content);
                throw new Error("SEARCH_APPOINTMENT_NOT_LOADED");
            }
            const verificationToken = await getRequestVerificationToken(page);
            console.log('Verification token:');
            console.log(verificationToken);
            const cookies = await page.cookies();
            return {
                verificationToken,
                cookies
            }
        } finally {
            browser.close();   
        }
    }
}

async function selectRoadTest(page) {
    await page.select('#SelectedServiceId', '5');
    await page.waitFor('#SelectedLanguageCode');
    await page.select('#SelectedLanguageCode', 'ENG');
    await page.click('#nextBtn');
}

async function inputPersonalData(page) {
    const authUrl = process.env.AUTH_PAGE_URL;
    await page.goto(authUrl);
    await page.waitFor('#authenticate-with-ddref');
    page.click('#authenticate-with-ddref');
    await page.waitFor('.g-recaptcha');
    const newContent = await page.content();
    const $ = cheerio.load(newContent);

    const siteKey = $('.g-recaptcha').attr('data-sitekey');
    const requestVerificationToken = $('input[name="__RequestVerificationToken"]').attr('value');
    console.log('request verification: ', requestVerificationToken);
    const apiKey = process.env["2CAPTCHA_API_KEY"];
    const requestId = await requestCaptcha(apiKey, siteKey);

    console.log('requestId: ', requestId);
    console.log('Requesting captcha solution');
    const captchaResolution = await waitForCaptcha(apiKey, requestId);

    console.log("Captcha resolution: ", captchaResolution);
    await page.type('#DocumentNumber', process.env.DOCUMENT_NUMBER);
    await page.type('#DateOfBirth', process.env.DATE_OF_BIRTH);
    await page.type('#Code', process.env.POSTAL_CODE);
    await page.evaluate((captchaRes) => {
        recaptchaCallback(captchaRes);
    }, captchaResolution);
    await page.click('#AgreeToTerms');
    await page.evaluate(() => document.getElementById('verify-identity-form').submit());
}

async function requestCaptcha(apiKey, siteKey) {
    const captchaRes = await axios.get(`https://2captcha.com/in.php?key=${apiKey}&method=userrecaptcha&googlekey=${siteKey}&pageurl=${encodeURIComponent('https://onlineservices.mpi.mb.ca/drivertesting/rt/identity/verify/')}&json=true`);
    console.log('Response: ', captchaRes.data);
    const requestId = captchaRes.data.request;
    return requestId;
}

async function getRequestVerificationToken(page) {
    const content = await page.content();
    const $ = cheerio.load(content);
    const verificationToken = $('input[name="__RequestVerificationToken"]').attr('value');
    return verificationToken;
}

function waitForCaptcha(apiKey, requestId) {
    return new Promise((resolve, reject) => {
        function auxWaitForCaptcha() {
            setTimeout(async () => {
                const response = await axios.get(`https://2captcha.com/res.php?key=${apiKey}&action=get&id=${requestId}&json=true`);
                console.log(response.data);
                if (response.data.status === 1) {
                    resolve(response.data.request);
                    // CAPCHA is not a spelling mistake, that's what the api returns
                } else if (response.data.request !== "CAPCHA_NOT_READY") {
                    return reject(response.data);
                } else {
                    auxWaitForCaptcha(resolve);
                }
            }, 5000);
        }

        auxWaitForCaptcha();
    });
}