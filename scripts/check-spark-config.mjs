import { readFileSync } from 'node:fs';
const settings = JSON.parse(readFileSync('public/firebase-config.json', 'utf8'));
const project = JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.default;
if (settings.mode !== 'firebase' || !settings.firebase?.projectId || !settings.firebase?.apiKey) throw new Error('Execute npm run firebase:publish para gerar a configuração pública antes do deploy.');
if (settings.emulators) throw new Error('Configuração de emuladores não pode ser publicada.');
if (settings.firebase.projectId !== project) throw new Error('A configuração pública pertence a outro projeto.');
for (const name of ['private_key','password','SENSOR_API_KEY','SMTP_PASSWORD']) if (JSON.stringify(settings).includes(name)) throw new Error('Configuração pública contém um campo privado.');
console.log('Configuração Spark verificada: sem servidores pagos ou credenciais privadas.');
