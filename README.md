# Terra Nova Mater

Nova apresentação do site de referência `just-terra-nova-flow.base44.app`: visual acolhedor, páginas responsivas e painel de monitoramento com usuários e administração. Implementação independente em React + Node.js 24 + SQLite. Nenhum cadastro, senha, pagamento ou histórico foi importado do Base44.

**Firebase:** configuração para Hosting + Cloud Functions + Firestore adicionada. Veja [FIREBASE.md](FIREBASE.md). O SQLite continua disponível para desenvolvimento local e Docker; na publicação Firebase, o armazenamento usa Firestore. A criação do projeto e o deploy exigem autenticação Google e faturamento Blaze. Não há site público publicado ainda.

## Desenvolvimento

```sh
cd /workspace/terra-gay
npm ci
node scripts/prepare-local.mjs
npm run dev
```

O servidor usa a porta 3000. A preparação local gera uma chave privada aleatória para a integração e a salva no `.env` ignorado pelo Git, sem exibir o valor nem substituir uma configuração existente. `npm run dev` e `npm start` carregam esse arquivo quando presente. `npm run build` gera a interface de produção; `npm test` valida os fluxos do servidor. Na nuvem, use o checkout existente: cada tarefa já tem isolamento e não precisa de um worktree adicional.

O backend cria o banco em `data/terra.sqlite`. Não apague essa pasta se quiser preservar os cadastros. O painel de demonstração (`/demonstracao`) usa exemplos identificados como fictícios; contas reais começam sem leituras.

## O que está implementado

- Site institucional, projeto, benefícios, jornada, histórias, equipe e plano mensal de R$ 40.
- Formulário de contato e inscrição em novidades, armazenados no painel administrativo.
- Cadastro, login, logout, recuperação por e-mail (requer SMTP) e redefinição com link temporário de uso único.
- Assinaturas pendentes, ativas e suspensas; liberação manual do pagamento pelo administrador.
- Painel, última leitura com atualização a cada 5 segundos, histórico, médias por dia, relatórios de 30 dias e PDF real.
- Administrador: busca/filtro de contas, liberação/suspensão, mensagens e cadastro de dispositivos vinculados a proprietários.
- Leituras por HTTPS com chave privada e isolamento por proprietário. Usuários pendentes/suspensos não acessam leituras nem relatórios.
- Atualizações incrementais: depois do carregamento inicial, o painel busca apenas leituras novas, reduzindo consultas repetidas ao histórico no Firestore.
- Firmware Wi-Fi NodeMCU/ESP8266: veja [as instruções](firmware/esp8266/README.md).

## Configuração e administrador

O Node 24 pode carregar variáveis de um arquivo privado:

```sh
node --env-file=.env server/index.js
```

Use `.env.example` como referência, nunca publique `.env`. Para criar o primeiro administrador, defina `ADMIN_EMAIL`, `ADMIN_PASSWORD` (10 a 128 caracteres) e opcionalmente `ADMIN_NAME` em variáveis seguras do ambiente, então execute `npm run create-admin`. Essas variáveis só são usadas pelo comando de criação. Não há conta administrativa ou senha padrão.

O cadastro público sempre cria usuário comum com assinatura pendente. A API não aceita elevar papel por formulário. A equipe confirma o pagamento e libera o acesso no painel. Sem `CHECKOUT_URL`, a assinatura abre o atendimento pelo WhatsApp original; com uma URL HTTPS válida, abre o checkout definido. Não há processamento de cartão ou renovação automática neste servidor. Uma página de sucesso, por si só, não ativa assinatura.

Recuperação de senha e avisos de contato dependem de `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM` e, quando exigidos pelo provedor, `SMTP_USER` e `SMTP_PASSWORD`. Sem SMTP, contatos ainda são salvos e visíveis para administradores; o site informa que a recuperação está indisponível. Newsletter registra consentimento e inscrições, mas não dispara campanhas automaticamente.

## Publicação e link público

Prepare uma hospedagem de **Node.js 24 ou Docker**, com **HTTPS** e **volume persistente**. Railway, Render e serviços equivalentes podem executar o Dockerfile; confirme no provedor a disponibilidade e o custo do volume antes de contratar. Plataformas apenas estáticas não executam este backend, e funções sem disco persistente não preservam este banco SQLite.

1. Envie o código para um repositório seu no GitHub ou carregue a imagem Docker na hospedagem.
2. Use o `Dockerfile` da raiz, ou configure `npm ci && npm run build` para build e `npm start` para iniciar com Node.js 24.
3. Configure `NODE_ENV=production`, `PUBLIC_ORIGIN=https://endereco-fornecido-pela-hospedagem` e `DATA_DIR` apontando para um volume persistente. No Docker, monte o volume em `/app/data`, com permissão de escrita para UID 1000. O provedor informa `PORT`, quando necessário.
4. Se houver exatamente um proxy reverso confiável à frente do app, configure `TRUST_PROXY=1`; com outra topologia, ajuste a confiança explicitamente antes de publicar. O app usa cookies seguros em produção.
5. Configure a chave privada `SENSOR_API_KEY` (mínimo 24 caracteres), SMTP e, opcionalmente, o checkout. Faça isso pelos campos seguros da hospedagem.
6. Crie o primeiro administrador pelo console privado da hospedagem usando o procedimento acima. Cadastre os dispositivos e os proprietários.
7. Confira `/api/health`, login, assinatura, permissão dos usuários e recebimento de uma leitura real. Use o endereço HTTPS fornecido pelo provedor como link público e no firmware.

Exemplo de preparação Docker (substitua a origem e use variáveis privadas):

```sh
docker build -t terra-nova .
docker run --env-file .env -v terra-nova-data:/app/data -p 3000:3000 terra-nova
```

Mantenha backup do volume/banco e use uma única instância gravando neste SQLite. Escala horizontal requer trocar o armazenamento por um banco compartilhado. Não há deploy automático nem link público criado por este projeto.

## Dados e hardware

O firmware recebido originalmente mede DS18B20 em D2 e mantém a umidade desligada até calibração. A nova interface não inventa pH, condutividade ou classificação agronômica. Só mostra o que chegou pelo dispositivo. As recomendações e classificações são opcionais, enviadas por uma fonte adequada; temperatura e umidade não diagnosticam sozinhas a saúde do solo.

As imagens são ilustrações locais e as fontes vêm do sistema. Não há dependência de CDN nem de chave Base44. Histórias e informações da equipe preservam o contexto público do projeto; dados demonstrativos são separados dos dados reais.
