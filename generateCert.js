// generateCert.js
const fs = require('fs');
const selfsigned = require('selfsigned');

async function generateCert() {
    try {
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256' });

        if (!pems || !pems.private || !pems.cert) {
            console.error('Certificate generation failed:', pems);
            return;
        }

        if (!fs.existsSync('./ssl')) fs.mkdirSync('./ssl');

        fs.writeFileSync('./ssl/server.key', pems.private);
        fs.writeFileSync('./ssl/server.cert', pems.cert);

        console.log('Certificates successfully generated in ./ssl/');
    } catch (err) {
        console.error('Error generating certificate:', err);
    }
}

generateCert();