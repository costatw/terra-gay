# Versão atual: Firebase Spark gratuito

A configuração padrão foi substituída por Hosting + Authentication + Firestore, sem Functions. As seções sobre Blaze abaixo são histórico da versão anterior. Consulte FIREBASE.md para a publicação atual.

# Validação da entrega

Validado nesta instância em 13/10/2026:

- Node.js 24.19.0; instalação reproduzida por `npm ci`, com lockfile.
- `npm run build`: interface de produção gerada com sucesso.
- `npm test`: **8 testes passaram; 0 falharam; 0 ignorados** (um teste principal e sete fluxos).
- `node tests/browser-check.mjs`: Chromium validou desktop e oito rotas em tela de 390 px, sem transbordamento horizontal ou erros de execução da página.
- Navegação, menus de celular, cadastro/login/logout, conta pendente, liberação pelo administrador, cadastro e associação de dispositivo, recebimento de temperatura, exibição no usuário correto, formulário de contato e download de PDF exercitados pelo navegador.
- O PDF baixado possui assinatura `%PDF`. Leituras demonstrativas estão identificadas como fictícias.
- API: restrições de papel e assinatura, isolamento entre dois proprietários, liberação/suspensão de sessão existente, chave de sensor, validação de indicadores, dados ausentes, contatos, newsletter, origem de requisições, uso único do token de senha e encerramento de sessões verificados.
- Configuração local privada criada sem imprimir valores; repetição preservou o arquivo existente. Servidor de desenvolvimento iniciado, saúde e páginas acessíveis por requisições internas. A chave local configurada aceita autenticação de ingestão e sensores desconhecidos são rejeitados.
- `git diff --check` passou. Os arquivos novos são os arquivos solicitados para criar a aplicação no repositório antes vazio. Dependências, build, banco e configuração privada ficam ignorados.

## O que ainda depende de configuração externa

- **Hospedagem e link público:** não foram criados. Há Dockerfile e procedimento no README. Publicar o ambiente Codex salva a preparação; não publica automaticamente este site na Internet.
- **Administrador real:** não há senha padrão. O responsável cria sua conta administrativa com variáveis privadas usando `npm run create-admin`.
- **Pagamento:** liberação manual preservada. O atendimento usa o WhatsApp original; checkout externo depende de `CHECKOUT_URL`. Não foi migrada a função de pagamento privada do Base44 e não há renovação automática implantada.
- **SMTP:** envio de recuperação/avisos não exercitado porque não há serviço configurado. A redefinição por token foi testada; sem SMTP, a solicitação de recuperação informa indisponibilidade. Os contatos permanecem salvos para a equipe.
- **Wi-Fi físico:** depende da placa NodeMCU ESP8266, da rede 2,4 GHz e do domínio HTTPS publicado. Ingestão no servidor foi testada; conexão da placa, sensores físicos e calibração não podem ser comprovadas nesta máquina.
- **Compilação do firmware:** PlatformIO 6.2.0 instalado, porém o registro `api.registry.platformio.org` respondeu 403 do proxy. O toolchain não pôde ser instalado e a compilação **não foi concluída**. Inclusão de `api.registry.platformio.org` e `dl.registry.platformio.org` foi salva no rascunho de rede; precisa ser aplicada para tentar `pio run` novamente. TLS/checksums não foram desabilitados.
- **Docker:** arquivo de publicação preparado; imagem não foi construída aqui. Antes da publicação, valide o build Docker no provedor e configure HTTPS e volume SQLite persistente.
- **Base44:** a referência foi analisada pelo frontend público. Backend privado, usuários, senhas, assinaturas e dados originais não foram importados.

`install_script` e `start_skill` foram salvos no rascunho de configuração. A publicação do ambiente e a restauração em outra tarefa não foram verificadas.

## Adaptação para Firebase

- Firebase CLI **15.33.0** instalado. A consulta real `firebase projects:list` falhou com **Failed to authenticate**; o arquivo de credenciais indicado pelo ambiente está vazio. Nenhuma credencial foi impressa, extraída ou criada para representar acesso ao Google.
- Configuração de Hosting, Cloud Functions em São Paulo e Firestore preparada. Regras bloqueiam acesso direto às coleções. Sessões no Firebase usam `__session`, que o Hosting encaminha à Function. A API mantém as verificações de papel, assinatura e proprietário.
- Dados locais continuam no SQLite; adapter Firestore e publicação independente foram adicionados. Não houve importação de contas ou dados para a nuvem.
- Depois da adaptação, o build e os **8 testes de API local** passaram novamente. A verificação de navegador passou novamente após corrigir o WebSocket de desenvolvimento para usar a mesma porta HTTP de cada servidor.
- API e interface usam atualização incremental com cursor: o histórico completo não é lido a cada ciclo de 5 segundos. Índices Firestore estão declarados para histórico e novas leituras.
- Dependências de Functions instaladas; preparação copia apenas os três módulos necessários, sem `.env`, banco SQLite ou arquivos do hardware.
- `npm run firebase:publish` foi executado, mas parou corretamente na verificação inicial de autenticação. **Projeto, banco remoto, Function e Hosting não foram criados; não existe URL pública verificada.**
- `npm run test:firebase` foi tentado. O download oficial do emulador Firestore em `storage.googleapis.com` foi bloqueado pelo proxy com **403**, impedindo a inicialização. Os testes da pilha Firebase **não executaram**; o adapter Firestore não deve ser descrito como validado em produção ou no emulador.
- Domínios necessários ao Firebase e ao download do emulador foram adicionados ao rascunho de rede, preservando os domínios anteriores. Essa alteração precisa ser aplicada em configurações e publicada no ambiente antes de repetir a operação bloqueada.
- Para prosseguir: autenticar a conta Google pelo fluxo oficial/credenciais seguras do ambiente. Depois da criação do projeto, Cloud Functions requer uma conta de faturamento Blaze autorizada. Não foram cadastrados dados de pagamento.

## Retomada em 14/10/2026

- Usuário informou que criou **terra-nova-a4343**. Alias configurado em `.firebaserc`; o script de publicação agora usa esse projeto e não cria um substituto. A consulta específica aos sites de Hosting continuou retornando falta de autenticação. A conta Google neste ambiente não está vinculada.
- O download oficial do emulador Firestore tornou-se acessível. Ajustado o cache para `.firebase/emulators`, evitando o diretório externo sem permissão de escrita.
- Corrigidas chamadas locais entre emuladores que o Firebase CLI encaminhava ao proxy externo. O ajuste só remove o dispatcher de proxy para destinos de loopback; HTTPS, certificados e proxy dos destinos externos permanecem intactos.
- Detectado e corrigido problema real de sessão: Firebase Hosting retirava `Set-Cookie` de respostas com `no-store` sem `private`. A API agora responde `private, no-store` e o Hosting preserva `__session`.
- **`npm run test:firebase` passou com código 0:** Hosting + Functions + Firestore inicializados; cadastro, sessão, liberação administrativa, sensor, leitura, isolamento entre proprietários, contatos/newsletter, redefinição única de senha, suspensão, logout e regras que impedem acesso direto às contas exercitados. Nenhum teste gravou no projeto real.
- Publicação externa continua pendente de autenticação e faturamento. A captura enviada mostra o plano Spark. Nenhum link público foi apresentado como publicado.

## Adaptação Spark em 14/10/2026

- Cloud Functions removido da configuração padrão e do comando de deploy. Não há criação de Secret Manager, TTL pago ou habilitação de faturamento.
- Cadastro/login e recuperação de senha usam Authentication. Perfis e permissões ficam no Firestore; listeners entregam mudanças em tempo real.
- Regras testadas bloqueiam autopromoção de papel, autoativação de assinatura, leitura de outro proprietário, escrita de usuário comum, sensor falso/desativado, indicadores fora da faixa e acesso público a mensagens privadas. Contato/newsletter só aceitam dados limitados e com consentimento.
- Teste Spark integrou Hosting + Auth + Firestore com Chromium, incluindo cadastro, admin, assinatura, sensor pelo protocolo REST real, relatório PDF e contato. A recuperação nativa também passou: código de ação gerado pelo Auth, redefinição pelo navegador e login com a nova senha. O emulador não comprova entrega do e-mail real.
- O firmware Spark compilou com PlatformIO para NodeMCU ESP8266: RAM estática 31.332 bytes (38,2%) e Flash 429.891 bytes (41,2%). Envio de 10 em 10 minutos; TLS ativo; raízes Google públicas; tokens privados não impressos. Wi-Fi físico continua não testado.
- Os oito testes do backend local e a verificação da interface em desktop/celular passaram novamente.
- Publicação remota continua pendente: a conta autenticada está no Cloud Shell do usuário, separado desta máquina. O projeto alvo permanece terra-nova-a4343.
