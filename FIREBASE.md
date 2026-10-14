# Publicação gratuita no Firebase Spark

A versão atual usa **Hosting + Authentication (e-mail/senha) + Firestore** no projeto **terra-nova-a4343**. O navegador recebe as mudanças do banco em tempo real e o sensor envia leituras por HTTPS com uma conta própria. A configuração padrão não publica Cloud Functions, Storage, Secret Manager ou TTL pago e não habilita faturamento.

Permaneça no plano **Spark**, sem vincular faturamento. O serviço é gratuito dentro das cotas desse plano; atingir uma cota pode interromper operações. Não é uma oferta de capacidade ilimitada. Veja as [cotas do Firestore](https://firebase.google.com/docs/firestore/quotas) e os [planos do Firebase](https://firebase.google.com/pricing).

## Preparar no console

1. Em **Authentication → Começar → Método de login**, habilite **E-mail/senha** e salve. Só essa modalidade é necessária.
2. Em **Firestore Database**, crie o banco padrão se ainda não existir, em modo de produção. O script também pode criar esse banco se sua conta tiver permissão. Realtime Database é outro produto e não é usado por esta versão.
3. Confirme que o projeto continua no plano Spark. Se você mudou para Blaze seguindo as instruções anteriores, volte ao Spark no console antes de prosseguir; confira com o responsável pelo faturamento possíveis gastos já ocorridos.

## Atualizar e publicar pelo Cloud Shell

Se a pasta ainda não estiver no Cloud Shell:

```sh
git clone --branch main https://github.com/costatw/terra-gay.git
cd terra-gay
```

Se já estiver lá:

```sh
cd ~/terra-gay
git pull --ff-only
```

Então execute:

```sh
nvm install 24
nvm use 24
npm ci
# Seu login Firebase no Cloud Shell já foi realizado; se necessário:
# npx firebase-tools@15.33.0 login --no-localhost
gcloud services enable firestore.googleapis.com identitytoolkit.googleapis.com --project terra-nova-a4343
npm run firebase:publish
```

O comando de publicação usa o ID de `.firebaserc`, obtém/cria o aplicativo Web, salva sua configuração pública em `public/firebase-config.json`, prepara o build, publica **somente firestore,hosting** e confirma que página e configuração estão acessíveis. Ele não cria outro projeto nem habilita um plano pago. Se houver uma restrição de permissões da organização, a mensagem do Google indicará o ajuste necessário ao responsável.

A chave Web `apiKey` é configuração pública, não uma credencial administrativa. As regras e os tokens do Authentication controlam o acesso. Senhas de pessoas, credenciais dos sensores e contas de serviço não vão para esse arquivo ou para o Git.

## Criar seu primeiro administrador

1. Abra o site publicado e crie sua conta pelo cadastro normal.
2. No console **Firestore Database → Dados → users**, localize seu documento pelo e-mail. O ID do documento é seu UID do Authentication.
3. Edite **apenas sua conta**: `role` deve ser a string `admin`, e `subscription_status` a string `active`.
4. Volte ao site. O perfil é atualizado pelo Firestore; entre novamente se necessário.

As regras impedem que o navegador eleve o próprio papel ou libere a própria assinatura. A alteração inicial é feita pelo titular autorizado no console Google. Depois, o painel administrativo libera/suspende usuários e cadastra sensores sem acesso ao console.

## Dados e sensores

- Contas do site: `users/{uid}`. Perfis são criados como usuário comum e assinatura pendente. Não há senhas no Firestore.
- Dispositivos: `devices/{id}`, com `name`, `user_id` (proprietário), `sender_uid` (conta exclusiva do sensor) e `enabled`.
- Leituras: `readings/{id}`, com temperatura, umidade e outros indicadores realmente medidos. `read_at` e `created_at` são **timestamps**, não textos.
- Mensagens/newsletter: `contacts`; leitura exclusiva da administração. Inscrições registram consentimento; campanhas não são disparadas automaticamente.
- Histórico administrativo: `audit`; registros de mudança de assinatura.

Uma conta ativa só lê suas leituras. Administradores veem a operação geral. A conta do dispositivo só consulta seu vínculo e cria leituras para ele; não tem acesso ao histórico ou à administração. `enabled=false` interrompe novas escritas daquele dispositivo.

Siga [firmware/esp8266/README.md](firmware/esp8266/README.md) para preparar a placa. O novo firmware não usa mais `/functions/receiveSensorData` ou uma chave compartilhada de servidor. Ele faz login no Authentication e grava no Firestore, que verifica as permissões. Envia a cada **10 minutos** por padrão (144 registros/dia por sensor) para reduzir consumo das cotas. O painel recebe mudanças em tempo real, sem consultar todo o histórico a cada 5 segundos.

## Recuperação de senha e assinatura

A recuperação usa o e-mail do Firebase Authentication e não precisa de SMTP próprio. O envio real depende da configuração/cota do Authentication; no emulador, verifica-se o código gerado e a redefinição. O template pode ser personalizado em Authentication → Templates, incluindo a URL `/reset-password` como página de ação se desejar usar a tela do site.

A confirmação de pagamento continua manual pela equipe e as assinaturas seguem no painel. O botão abre o WhatsApp original; um checkout externo opcional pode ser definido como `checkoutUrl` na configuração pública. Essa opção não processa cartões nem confirma automaticamente um pagamento.

## Testes

- `npm run test:firebase`: Hosting + Authentication + Firestore, regras e navegador, sem Functions ou projeto real; requer Java 21, Chromium e CLI.
- `npm test`: valida o backend Node/SQLite mantido para desenvolvimento local.
- `node tests/browser-check.mjs`: interface em desktop/celular no modo local.
- `pio run --project-dir firmware/esp8266`: compila o firmware NodeMCU ESP8266.

A versão Spark foi validada nos emuladores. O teste físico de Wi-Fi e sensores exige sua placa/rede. O login no Cloud Shell não autentica esta sessão do chat; a publicação real deve ser executada no terminal autorizado, e só se considera pública após a confirmação do deploy.
