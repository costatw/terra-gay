# ESP8266 por Wi-Fi no plano gratuito Spark

O sketch preserva DS18B20 em **D2**, leitura analógica em **A0** e umidade desativada até conexão segura/calibração. A placa presumida é **NodeMCU ESP8266**. Outras placas exigem ajustar pinos e alvo.

## Preparar

1. Publique o site conforme [FIREBASE.md](../../FIREBASE.md) e habilite Authentication por e-mail/senha.
2. Crie uma **conta exclusiva do sensor** em Authentication → Usuários → Adicionar usuário. Escolha e-mail e senha privados; não use sua conta administrativa. Copie o UID dessa conta.
3. No painel administrativo do site, abra **Sensores** e cadastre `prototype-01`. Escolha a conta proprietária das leituras e informe o UID exclusivo do sensor. Libere a assinatura do proprietário quando apropriado.
4. Copie `include/config.example.h` para **`include/terra-private-config.h`**, ignorado pelo Git. Preencha Wi-Fi, projeto, chave pública Web do Firebase, e-mail/senha exclusivos do sensor e identificação. Não publique esse arquivo.
5. Na pasta da placa, rode `pio run`, depois `pio run --target upload` e `pio device monitor` com a placa conectada.

`config.h` não é usado nesta versão: esse nome também existe em bibliotecas, e o nome exclusivo evita incluir um arquivo errado. Preserve configurações antigas e transfira apenas os valores necessários para o novo modelo.

## Funcionamento

- Wi-Fi **2,4 GHz**, acesso de saída HTTPS/443 a `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` e `firestore.googleapis.com`, além de DNS e NTP/UDP 123.
- O firmware sincroniza o relógio, valida certificado/hostname HTTPS, faz login e renova tokens expirados. Não imprime credenciais ou tokens.
- As raízes públicas Google Trust Services estão em `google-roots.h`; a verificação TLS permanece habilitada. Atualize as raízes por uma fonte confiável se a cadeia do serviço mudar.
- Busca o vínculo do dispositivo e envia uma escrita Firestore com `created_at` gerado pelo servidor. As regras limitam o UID do sensor a esse dispositivo e proprietário.
- Envio inicial quando a rede/relógio estiverem prontos; depois, a cada **10 minutos**. Isso equivale a 144 registros/dia por sensor. Conta/plano gratuitos têm cotas compartilhadas; monitore o uso no console. Esta versão não armazena uma fila offline.
- Se perder a rede, reconecta e tenta quando houver conectividade. Se o cadastro tiver `enabled=false`, não envia. Para bloquear um sensor, edite essa propriedade no Firestore.

## Calibração

Mantenha `UMIDADE_CONECTADA=false` enquanto AOUT estiver desconectado. Verifique a faixa de tensão admitida em A0 **da sua placa** antes da ligação; placas e chips podem ter faixas diferentes. Depois, preencha `VALOR_SECO` e `VALOR_UMIDO` com suas leituras reais e habilite a umidade. Sem calibração, só a temperatura válida é enviada. pH e condutividade não são inventados.

O firmware foi compilado para NodeMCU ESP8266. O protocolo REST autenticado foi exercitado no emulador Firestore. Gravação, TLS contra o serviço público e leituras físicas precisam ser confirmadas na placa e na sua rede.
