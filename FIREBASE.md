# Publicacao no Firebase

Esta configuracao publica a interface em **Firebase Hosting**, a API em **Cloud Functions** (Sao Paulo, `southamerica-east1`) e os dados em **Firestore**. Login, administracao, assinatura e recepcao dos sensores usam a mesma API ja implementada. No Firebase, os dados nao dependem de disco local ou SQLite.

## Requisitos

- Conta Google autenticada no Firebase CLI, com permissao para criar/administrar o projeto.
- Node.js 24 e Firebase CLI 15.33.0 ou superior.
- Projeto com faturamento **Blaze** habilitado, exigido pelo Cloud Functions. Hosting sozinho nao executa este backend. Confirme custos e alertas no console antes de vincular faturamento; o codigo limita a funcao a 3 instancias, mas isso nao constitui um limite de gasto.
- APIs de Firestore, Functions, Cloud Build, Artifact Registry, Secret Manager e Hosting disponiveis.

Nenhum projeto ou conta foi criado automaticamente sem autenticacao. Nao envie senhas, tokens ou chaves privadas pelo chat.

## Caminho de publicacao

Projeto escolhido pelo usuário: **`terra-nova-a4343`**, já registrado em `.firebaserc`. A criação foi informada pelo usuário; acesso e publicação remotos ainda dependem de autenticação. O assistente de deploy usa esse projeto e não cria outro quando esse alias está configurado.

### Pelo Cloud Shell do Google

Na barra direita do console Google/Firebase, o ícone `>_` abre o Cloud Shell. Entrar nele permite que você publique usando sua conta; não autentica automaticamente a sessão deste chat.

1. Baixe `terra-nova-mater.zip` atualizado e envie-o ao Cloud Shell pela opção **Upload** do menu de três pontos do terminal.
2. Habilite o plano Blaze pelo botão **Fazer upgrade** do console, se decidir usar o backend Functions. O plano Spark exibido na captura não atende ao requisito desta versão.
3. No Cloud Shell, execute:

```sh
unzip terra-nova-mater.zip
cd terra-nova-mater
nvm install 24
nvm use 24
npm ci
npx firebase-tools@15.33.0 login --no-localhost
```

Conclua o fluxo oficial do Google e insira eventual código apenas no terminal. Depois:

```sh
gcloud services enable firestore.googleapis.com --project terra-nova-a4343
npm run firebase:publish
```

O comando de publicação prepara e instala as Functions, constrói o site, registra a chave privada e executa o deploy no projeto selecionado. Se permissões da organização ou faturamento impedirem a operação, use a mensagem do Google para solicitar o ajuste ao responsável. A URL só deve ser divulgada depois de a verificação pública de saúde passar. Para operar a administração, configure a primeira conta conforme a seção abaixo.

### Pelo seu computador ou pelo terminal deste ambiente

No seu computador, com o projeto baixado:

```sh
npm ci
npx firebase-tools@15.33.0 login
```

O login abre o fluxo oficial do Google. Depois, execute `npm run firebase:publish`. O assistente pergunta o ID do projeto, oferece criar um projeto novo, prepara o build e as Functions, verifica faturamento, cria o Firestore quando necessario, registra a chave de sensores no Secret Manager e publica. Ele so informa a URL publica apos deploy e verificacao de saude bem-sucedidos. A chave existente em `.env` e reaproveitada sem exibir seu valor; se nao houver uma chave, o assistente gera uma e salva um arquivo privado.

Se quiser executar os passos manualmente, escolha um ID globalmente unico e substitua `SEU_PROJECT_ID`:

```sh
npx firebase-tools@15.33.0 projects:create SEU_PROJECT_ID --display-name "Terra Nova Mater"
```

No [console Firebase](https://console.firebase.google.com/), vincule o faturamento Blaze ao projeto se necessario. Nao use dados de pagamento de terceiros. Crie o banco padrao Firestore na localizacao `southamerica-east1` quando disponivel para seu projeto, ou use a localizacao adequada no console. As regras deste repositorio bloqueiam acesso direto pelo navegador; o Admin SDK usa IAM.

```sh
npx firebase-tools@15.33.0 use --add
node scripts/prepare-firebase.mjs
npm --prefix firebase-functions ci
npx firebase-tools@15.33.0 functions:secrets:set SENSOR_API_KEY --project SEU_PROJECT_ID
npx firebase-tools@15.33.0 deploy --only firestore,functions,hosting --project SEU_PROJECT_ID
```

A chave deve ter pelo menos 24 caracteres e deve ser inserida pelo terminal seguro ou Secret Manager, nunca colocada no codigo ou em variaveis publicas do frontend. O terminal de deploy pode pedir configuracao de retencao de imagens no Artifact Registry; use uma politica adequada para evitar acumulo de imagens antigas.

## Primeiro administrador

Use uma credencial local do Google autorizada a escrever no Firestore. No seu computador, `gcloud auth application-default login` configura credenciais do Admin SDK; esse login e separado do Firebase CLI. Alternativamente, configure uma conta de servico pelo mecanismo seguro da sua hospedagem. Nunca salve arquivos de conta de servico no Git.

Defina `STORAGE_BACKEND=firestore`, `GOOGLE_CLOUD_PROJECT=SEU_PROJECT_ID`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` pelo ambiente privado. Entao rode `npm run create-admin`. O comando nao muda contas existentes. Contas locais SQLite nao sao importadas automaticamente.

## Sensor por Wi-Fi

Depois que o site estiver realmente publicado, o firmware usara o endpoint HTTPS do dominio fornecido pelo deploy com o caminho `/functions/receiveSensorData`. Cadastre o dispositivo no painel administrativo e coloque no firmware a mesma chave registrada no Secret Manager. Configure a raiz de certificado correspondente ao dominio Firebase; a raiz usada no exemplo anterior nao deve ser presumida correta para o Firebase.

## E-mail e checkout

Valores nao secretos podem ser definidos em `firebase-functions/.env.SEU_PROJECT_ID`: `PUBLIC_ORIGIN` (para dominio personalizado), `ALLOWED_ORIGINS` (lista de origens HTTPS proprias), `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `MAIL_FROM`, `CONTACT_EMAIL` e `CHECKOUT_URL`.

Se configurar SMTP, registre a senha com `firebase functions:secrets:set SMTP_PASSWORD --project SEU_PROJECT_ID` e republique Functions. Nao coloque senhas em `.env.SEU_PROJECT_ID`. Sem SMTP, o envio de recuperacao fica indisponivel e contatos continuam armazenados. Sem checkout, a assinatura continua pelo atendimento via WhatsApp e liberacao manual.

## Emuladores e verificacao

`npm run test:firebase` exercita Firebase Hosting + Functions + Firestore localmente num projeto `demo-terra-nova`, sem gravar em um projeto real. Requer Java 21 para o emulador Firestore e acesso ao download oficial do emulador. As credenciais temporarias do teste ficam em arquivos ignorados e sao removidas ao final.

O teste usa `.firebase/emulators` para o cache e um ajuste restrito a requisições de loopback, pois o Firebase CLI encaminhava chamadas entre emuladores ao proxy externo. Requisições externas mantêm o proxy e a verificação TLS. As respostas da API usam `Cache-Control: private, no-store` para que o Hosting preserve o cookie `__session`. A pilha integrada foi validada com sucesso no emulador em 14/10/2026.

Antes de divulgar a URL publica, confirme `/api/health`, login, cookie `__session`, permissao por assinatura, isolamento das leituras e uma leitura de sensor. Nao considere um deploy apenas do HTML como publicacao completa da aplicacao.
