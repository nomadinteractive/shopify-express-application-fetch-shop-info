const dotenv = require('dotenv').config();
const express = require('express');
const app = express();
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');

const apiKey = process.env.SHOPIFY_API_KEY;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const appUrl = process.env.APP_URL;
const httpProtocol = process.env.HTTP_PROTOCOL;

const scopes = 'read_products';
const forwardingAddress = appUrl;

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.listen(3000, () => {
    console.log('Example app listening on port 3000!');
});

app.get('/shopify', (req, res) => {
    const shop = req.query.shop;
    if (shop) {
        const state = nonce();
        const redirectUri = forwardingAddress + '/shopify/callback';
        const installUrl = httpProtocol + '://' + shop +
            '/admin/oauth/authorize?client_id=' + apiKey +
            '&scope=' + scopes +
            '&state=' + state +
            '&redirect_uri=' + redirectUri;

        res.cookie('state', state);
        res.redirect(installUrl);
    } else {
        return res.status(400).send('Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request');
    }
});

app.get('/shopify/callback', (req, res) => {
    const { shop, hmac, code, state } = req.query;
    const stateCookie = cookie.parse(req.headers.cookie).state;

    if (state !== stateCookie) {
        return res.status(403).send('Request origin cannot be verified');
    }

    if (shop && hmac && code) {
        const map = Object.assign({}, req.query);
        delete map['signature'];
        delete map['hmac'];
        const message = querystring.stringify(map);
        const providedHmac = Buffer.from(hmac, 'utf-8');
        const generatedHash = Buffer.from(
            crypto
                .createHmac('sha256', apiSecret)
                .update(message)
                .digest('hex'),
            'utf-8'
        );
        let hashEquals = false;
        // timingSafeEqual will prevent any timing attacks. Arguments must be buffers
        try {
            hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac)
            // timingSafeEqual will return an error if the input buffers are not the same length.
        } catch (e) {
            hashEquals = false;
        };

        if (!hashEquals) {
            return res.status(400).send('HMAC validation failed');
        }

        const accessTokenRequestUrl = httpProtocol + "://" + shop + "/admin/oauth/access_token";
        const accessTokenPayLoad = {
            client_id: apiKey,
            client_secret: apiSecret,
            code
        };

        request.post(accessTokenRequestUrl, { json: accessTokenPayLoad })
            .then((accessTokenResponse) => {
                const accessToken = accessTokenResponse.access_token;
                const shopApiRequestUrl = httpProtocol + "://" + shop + "/admin/shop.json";
                const shopRequestHeaders = {
                    "X-Shopify-Access-Token": accessToken
                };

                request.get(shopApiRequestUrl, { headers: shopRequestHeaders })
                    .then((apiResponse) => {
                        res.end(apiResponse);
                    });
            })
            .catch((error) => {
                console.log(error);
            });
    } else {
        res.status(400).send('Required parameters missing');
    }
});