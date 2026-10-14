#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>
#include <time.h>
#include "google-roots.h"
#if __has_include("terra-private-config.h")
#include "terra-private-config.h"
#else
#include "config.example.h"
#endif
const uint8_t PINO_TEMPERATURA = D2, PINO_UMIDADE = A0;
const bool UMIDADE_CONECTADA = false;
const int VALOR_SECO = -1, VALOR_UMIDO = -1;
const unsigned long INTERVALO_ENVIO = 10UL * 60UL * 1000UL;
OneWire barramento(PINO_TEMPERATURA);
DallasTemperature temperatura(&barramento);
unsigned long ultimoEnvio = 0, tokenExpira = 0;
bool configurado = false;
String idToken, refreshToken;
int lerUmidade() { long soma=0; for(int i=0;i<10;i++){soma+=analogRead(PINO_UMIDADE);delay(10);} return soma/10; }
String encodeForm(const String& input) {
  String out; const char* hex="0123456789ABCDEF";
  for(unsigned int i=0;i<input.length();i++) { unsigned char c=input[i];
    if(isalnum(c)||c=='-'||c=='_'||c=='.'||c=='~')out+=char(c);
    else{out+='%';out+=hex[c>>4];out+=hex[c&15];}
  } return out;
}
int https(const String& url,const String& payload,String& response,bool auth=false,bool form=false) {
  BearSSL::X509List roots(GOOGLE_ROOTS); BearSSL::WiFiClientSecure client;
  client.setTrustAnchors(&roots); // Certificado, hostname e validade verificados.
  HTTPClient http;http.setTimeout(15000);
  if(!http.begin(client,url))return -1;
  if(auth)http.addHeader("Authorization","Bearer "+idToken);
  http.addHeader("Content-Type",form?"application/x-www-form-urlencoded":"application/json");
  int status=payload.length()?http.POST(payload):http.GET();
  if(status>0) { response=http.getString(); }
  http.end();
  return status;
}
bool loginFirebase() {
  if(idToken.length()&&(long)(tokenExpira-millis())>60000)return true;
  String response;JsonDocument auth;int status;
  if(refreshToken.length()) {
    String payload="grant_type=refresh_token&refresh_token="+encodeForm(refreshToken);
    status=https(String("https://securetoken.googleapis.com/v1/token?key=")+FIREBASE_API_KEY,payload,response,false,true);
    if(status==200&&!deserializeJson(auth,response)){
      idToken=auth["id_token"].as<String>();refreshToken=auth["refresh_token"].as<String>();
      tokenExpira=millis()+auth["expires_in"].as<unsigned long>()*1000UL;return idToken.length()>0;
    }idToken="";refreshToken="";
  }
  JsonDocument request;request["email"]=DEVICE_EMAIL;request["password"]=DEVICE_PASSWORD;request["returnSecureToken"]=true;
  String payload;serializeJson(request,payload);
  status=https(String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=")+FIREBASE_API_KEY,payload,response);
  auth.clear();
  if(status!=200||deserializeJson(auth,response)){Serial.print("Login nao concluido. HTTP: ");Serial.println(status);return false;}
  idToken=auth["idToken"].as<String>();refreshToken=auth["refreshToken"].as<String>();
  tokenExpira=millis()+auth["expiresIn"].as<unsigned long>()*1000UL;return idToken.length()>0;
}
void enviarLeitura() {
  if(!loginFirebase())return;
  String documents=String("projects/")+FIREBASE_PROJECT_ID+"/databases/(default)/documents",response;
  int status=https(String("https://firestore.googleapis.com/v1/")+documents+"/devices/"+DEVICE_ID,"",response,true);
  JsonDocument device;
  if(status!=200||deserializeJson(device,response)){Serial.print("Confira cadastro e UID do sensor. HTTP: ");Serial.println(status);return;}
  if(!device["fields"]["enabled"]["booleanValue"].as<bool>()){Serial.println("Sensor desativado.");return;}
  String owner=device["fields"]["user_id"]["stringValue"].as<String>();
  if(!owner.length()){Serial.println("Sensor sem proprietario.");return;}
  temperatura.requestTemperatures();float graus=temperatura.getTempCByIndex(0);
  JsonDocument request;JsonObject write=request["writes"].to<JsonArray>().add<JsonObject>();
  write["update"]["name"]=documents+"/readings/"+DEVICE_ID+"-"+String(time(nullptr))+"-"+String(ESP.random(),HEX);
  JsonObject fields=write["update"]["fields"].to<JsonObject>();
  fields["device_id"]["stringValue"]=DEVICE_ID;fields["user_id"]["stringValue"]=owner;
  bool valido=false;
  if(graus!=DEVICE_DISCONNECTED_C&&isfinite(graus)&&graus>=-55&&graus<=125){
    fields["temperatura"]["doubleValue"]=graus;valido=true;Serial.print("Temperatura: ");Serial.print(graus,1);Serial.println(" C");
  }else Serial.println("Sensor de temperatura ausente. Confira D2, alimentacao e resistor.");
  if(UMIDADE_CONECTADA){
    int leitura=lerUmidade();Serial.print("Umidade bruta: ");Serial.println(leitura);
    if(VALOR_SECO>=0&&VALOR_UMIDO>=0&&VALOR_SECO!=VALOR_UMIDO){
      float percentual=100.0f*(leitura-VALOR_SECO)/(float(VALOR_UMIDO)-float(VALOR_SECO));
      fields["umidade"]["doubleValue"]=constrain(percentual,0.0f,100.0f);valido=true;
    }else Serial.println("Umidade nao calibrada; indicador omitido.");
  }else Serial.println("Leitura de umidade desativada.");
  if(!valido){Serial.println("Sem indicadores validos. Nada enviado.");return;}
  time_t stamp=time(nullptr);struct tm utc;gmtime_r(&stamp,&utc);char date[30];strftime(date,sizeof(date),"%Y-%m-%dT%H:%M:%SZ",&utc);
  fields["read_at"]["timestampValue"]=date;write["currentDocument"]["exists"]=false;
  JsonObject transform=write["updateTransforms"].to<JsonArray>().add<JsonObject>();
  transform["fieldPath"]="created_at";transform["setToServerValue"]="REQUEST_TIME";
  String payload;serializeJson(request,payload);response="";
  status=https(String("https://firestore.googleapis.com/v1/")+documents+":commit",payload,response,true);
  if(status==200)Serial.println("Leitura recebida pelo Firestore.");
  else{Serial.print("Envio nao concluido. HTTP: ");Serial.println(status);if(status==401)idToken="";}
}
void setup() {
  Serial.begin(115200);temperatura.begin();temperatura.setWaitForConversion(true);
  Serial.println("\nTerra Nova Mater - Wi-Fi com Firebase Spark");
  configurado=!String(WIFI_SSID).startsWith("PREENCHA")&&!String(FIREBASE_API_KEY).startsWith("PREENCHA")
    &&!String(DEVICE_EMAIL).startsWith("PREENCHA")&&!String(DEVICE_PASSWORD).startsWith("PREENCHA");
  if(!configurado){Serial.println("Preencha include/terra-private-config.h. Nao publique credenciais.");return;}
  WiFi.persistent(false);WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(true);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
  configTime(0,0,"pool.ntp.org","time.nist.gov");ultimoEnvio=millis()-INTERVALO_ENVIO;
  Serial.println("Conectando a rede e sincronizando horario para HTTPS.");
}
void loop() {
  if(configurado&&WiFi.status()==WL_CONNECTED&&time(nullptr)>=1700000000&&millis()-ultimoEnvio>=INTERVALO_ENVIO){ultimoEnvio=millis();enviarLeitura();}
  delay(200);
}
