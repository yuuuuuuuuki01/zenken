import forge from 'node-forge';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certsDir = path.join(__dirname, '../certs');
if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir);

function generateCert({ commonName, isCA = false, signWith }) {
    console.log(`Generating certificate for ${commonName}...`);
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + Math.floor(Math.random() * 1000000);
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    const attrs = [{
        name: 'commonName',
        value: commonName
    }, {
        name: 'countryName',
        value: 'JP'
    }, {
        shortName: 'ST',
        value: 'Kanagawa'
    }, {
        name: 'localityName',
        value: 'Fujisawa'
    }, {
        name: 'organizationName',
        value: 'GigaCompute'
    }, {
        shortName: 'OU',
        value: 'Security'
    }];

    cert.setSubject(attrs);
    cert.setIssuer(signWith ? signWith.cert.subject.attributes : attrs);

    if (isCA) {
        cert.setExtensions([{
            name: 'basicConstraints',
            cA: true
        }, {
            name: 'keyUsage',
            keyCertSign: true,
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }]);
    } else {
        cert.setExtensions([{
            name: 'basicConstraints',
            cA: false
        }, {
            name: 'keyUsage',
            digitalSignature: true,
            nonRepudiation: true,
            keyEncipherment: true,
            dataEncipherment: true
        }, {
            name: 'extKeyUsage',
            serverAuth: true,
            clientAuth: true,
            codeSigning: true,
            emailProtection: true,
            timeStamping: true
        }]);
    }

    cert.sign(signWith ? signWith.key : keys.privateKey, forge.md.sha256.create());

    return {
        cert: cert,
        key: keys.privateKey,
        certPem: forge.pki.certificateToPem(cert),
        keyPem: forge.pki.privateKeyToPem(keys.privateKey)
    };
}

// 1. Generate CA
const ca = generateCert({ commonName: 'GigaCompute Root CA', isCA: true });
fs.writeFileSync(path.join(certsDir, 'ca.crt'), ca.certPem);
fs.writeFileSync(path.join(certsDir, 'ca.key'), ca.keyPem);

// 2. Generate Server Cert
const server = generateCert({ commonName: 'localhost', signWith: ca });
fs.writeFileSync(path.join(certsDir, 'server.crt'), server.certPem);
fs.writeFileSync(path.join(certsDir, 'server.key'), server.keyPem);

// 3. Generate Client Cert
const client = generateCert({ commonName: 'GigaCompute Agent', signWith: ca });
fs.writeFileSync(path.join(certsDir, 'client.crt'), client.certPem);
fs.writeFileSync(path.join(certsDir, 'client.key'), client.keyPem);

console.log('✅ All certificates generated in ./certs/');
