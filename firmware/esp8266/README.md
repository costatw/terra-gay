# Temperatura e umidade pela rede Wi-Fi

Exemplo adaptado do sketch fornecido para **NodeMCU ESP8266**, DS18B20 em D2 e umidade em A0. Se sua placa for diferente, ajuste o alvo e os pinos antes de gravar.

1. Publique o servidor com HTTPS e armazenamento persistente.
2. Defina `SENSOR_API_KEY` no servidor com uma chave aleatória privada de pelo menos 24 caracteres.
3. Entre como administrador, abra **Sensores** e cadastre `prototype-01`, escolhendo a conta proprietária. Libere a assinatura da conta depois da confirmação do pagamento.
4. Copie `include/config.example.h` para `include/config.h`. Preencha SSID, senha Wi-Fi, URL pública, a mesma chave privada e identificação do dispositivo. Esse arquivo é ignorado pelo Git.
5. Configure o certificado raiz PEM do domínio em `ROOT_CA`. `certs/isrg-root-x1.pem` pode ser usado **somente se** o domínio publicado tiver uma cadeia ancorada nessa raiz. Obtenha a raiz correta da autoridade emissora se for outra. O firmware verifica certificado, hostname e validade; não desabilite TLS.
6. Na pasta `firmware/esp8266`, execute `pio run`, depois `pio run --target upload` com a placa conectada e `pio device monitor` para acompanhar.

O ESP8266 se conecta a Wi-Fi de **2,4 GHz**. Deve conseguir resolver DNS, acessar o site por HTTPS/443 e sincronizar o relógio por NTP/UDP 123. Não precisa abrir portas no roteador: a placa inicia a conexão de saída.

O envio é tentado a cada 30 segundos. Se cair a rede, há reconexão automática e nova tentativa no próximo ciclo; esta versão não mantém uma fila offline. O site consulta novas leituras a cada 5 segundos.

`UMIDADE_CONECTADA` permanece `false`, como no seu sketch. Verifique a faixa de tensão admitida em A0 **da sua placa** antes de conectar AOUT; ela pode diferir entre o ESP8266 nu e placas com divisor de tensão. Depois de conectar com segurança, calibre `VALOR_SECO` e `VALOR_UMIDO` e habilite a leitura. Sem calibração, só a temperatura é enviada. Sensores ausentes não geram valores inventados. pH e condutividade só serão exibidos se equipamentos apropriados enviarem esses indicadores.

O servidor aceita:

```http
POST /functions/receiveSensorData
Content-Type: application/json
x-sensor-api-key: SUA_CHAVE_PRIVADA
```

```json
{
  "device_id": "prototype-01",
  "temperatura": 24.8,
  "umidade": 45.2
}
```

`POST /api/sensor/readings` é um alias. `read_at` é opcional: sem ele, o servidor registra o horário de recebimento. `ph`, `condutividade`, `nivel_degradacao` e `recomendacao` também são opcionais. O servidor não infere degradação apenas de temperatura e umidade.

Respostas: **201** recebida; **401** chave inválida; **404** sensor não cadastrado; **400** indicador/data inválidos; **503** integração ainda não configurada.

A chave compartilhada permite ingestão para os sensores cadastrados. Mantenha-a privada, rotacione se exposta e não a coloque em formulários, navegador ou Git. Antes de crescer para vários clientes, evolua para credenciais individuais por dispositivo.

Compilação pode ser validada na nuvem; a conexão Wi-Fi e os sensores físicos precisam ser testados na sua placa e rede.
