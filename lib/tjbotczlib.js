/**
 * Copyright 2018 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

 'use strict';

 // useful node modules
 const assert = require('assert');
 const temp = require('temp').track();
 const Promise = require('bluebird');
 const fs = require('fs');
 const sleep = require('sleep');
 const colorToHex = require('colornames');
 const cm = require('color-model');
 const winston = require('winston');
 const got = require('got'); 
 const FormData = require('form-data');
 const Mic = require('mic');
 const Raspistill = require('node-raspistill').Raspistill;
 const gpio = require("pigpio").Gpio;  //Pigpio library for LED
 const { resolve } = require('bluebird');
 
 /**
  * TJBot
  * @param {String} hardware The set of hardware with which TJBot is equipped (see TJBot.prototype.hardware).
  * @param {Object} configuration Configuration parameters
  * @param {Object} credentials The set of service credentials needed for external services (see TJBot.prototype.services).
  * @constructor
  */
 function TJBot(hardware, configuration, credentials) {
     if (!(this instanceof TJBot)) {
         throw new Error('"new" keyword required to create TJBot service instances')
     }
 
     // import configuration params
     this.configuration = Object.assign({}, TJBot.prototype.defaultConfiguration, configuration);
 
      // set up logging
     winston.configure({
         level: this.configuration.log.level || 'info',
         format: winston.format.simple(),
         transports: [
             new winston.transports.Console(),
         ],
     }); 
     
     // set up the hardware
     if (hardware == undefined) {
         throw new Error('must define a hardware configuration for TJBot');
     }
 
     hardware.forEach(function(device) {
         switch (device) {
             case 'camera':
                 this._setupCamera()
                 break;
 
             case 'led':
                 this._setupLED();
                 break;
 
             case 'rgb_led':
                 this._setupRGBLed();
                 break;
 
             case 'microphone':
                 this._setupMicrophone();
                 break;
 
             case 'servo':
                 this._setupServo(this.configuration.wave.servoPin);
                 break;
 
             case 'speaker':
                 this._setupSpeaker();
                 break;
         }
     }, this);
 
     // set up additional services when their credentials are specified
     if (credentials != undefined) {
 
         // > assistant
         if (credentials.hasOwnProperty('assistant')) {
             var creds = credentials['assistant'];
             this._createServiceAPI('assistant', creds);
         }
 
         // > language translator
         if (credentials.hasOwnProperty('language_translator')) {
             var creds = credentials['language_translator'];
             this._createServiceAPI('language_translator', creds);
         }
 
         // > speech to text
         if (credentials.hasOwnProperty('speech_to_text')) {
             var creds = credentials['speech_to_text'];
             this._createServiceAPI('speech_to_text', creds);
         }
 
         // > text to speech
         if (credentials.hasOwnProperty('text_to_speech')) {
             var creds = credentials['text_to_speech'];
             this._createServiceAPI('text_to_speech', creds);
         }
 
         // > tone analyzer
         if (credentials.hasOwnProperty('tone_analyzer')) {
             var creds = credentials['tone_analyzer'];
             this._createServiceAPI('tone_analyzer', creds);
         }
 
          //> visual recognition
         if (credentials.hasOwnProperty('visual_recognition')) {
             var creds = credentials['visual_recognition'];
             this._createServiceAPI('visual_recognition', creds);
         }
         
     }
 
     winston.info("Hello from TJBot! My name is " + this.configuration.robot.name + ".");
     winston.verbose("TJBot library version " + TJBot.prototype.version);
     
     winston.silly("TJBot configuration:");
     winston.silly(this.configuration);
 }
 
 /**
  * TJBot module version
  */
 TJBot.prototype.version = 'v1.0.0';
 
 /**
  * List of TJBot hardware and services.
  */
 TJBot.prototype.capabilities = ['analyze_tone', 'converse', 'listen', 'see', 'shine', 'speak', 'translate', 'wave'];
 TJBot.prototype.hardware = ['camera', 'led', 'rgb_led', 'microphone', 'servo', 'speaker'];
 TJBot.prototype.services = ['assistant', 'language_translator', 'speech_to_text', 'text_to_speech', 'tone_analyzer', 'visual_recognition'];
 
 /**
  * Default configuration parameters.
  */
 TJBot.prototype.defaultConfiguration = {
     log: {
         level: 'info' // valid levels are 'error', 'warn', 'info', 'verbose', 'debug', 'silly'
     },
     robot: {
         gender: 'male', // ['male', 'female']
         name: 'Michael'
     },
     listen: {
         microphoneDeviceId: "plughw:1,0", // plugged-in USB card 1, device 0; see `arecord -l` for a list of recording devices
         inactivityTimeout: -1, // -1 to never timeout or break the connection. Set this to a value in seconds e.g 120 to end connection after 120 seconds of silence
         language: 'en-US', // see TJBot.prototype.languages.listen
         customization_id: '' //customization model id for STT
     },
     wave: {
         servoPin: 7 // corresponds to BCM 7 / physical PIN 26
     },
     speak: {
         language: 'en-US', // see TJBot.prototype.languages.speak
         voice: undefined, // use a specific voice; if undefined, a voice is chosen based on robot.gender and speak.language
                           // english voices: en-US_MichaelVoice, en-US_AllisonVoice, en-US_LisaVoice, en-GB_KateVoice
         speakerDeviceId: "plughw:0,0" // plugged-in USB card 1, device 0; `see aplay -l` for a list of playback devices
         //speakerDeviceId: "bluealsa:HCI=hci0,DEV=XX:XX:XX:XX:XX:XX,PROFILE=a2dp" // bluetooth speaker, set mac adress from "cat ~/.asoundrc" device
     
     },
     see: {
         confidenceThreshold: {
             object: 0.5,
             text: 0.1
         },
         camera: {
             height: 720,
             width: 960,
             verticalFlip: false, // flips the image vertically, may need to set to 'true' if the camera is installed upside-down
             horizontalFlip: false // flips the image horizontally, should not need to be overridden
         },
         language: 'en'
     }
 };
 
 // List of all available configuration parameters
 TJBot.prototype.configurationParameters = Object.keys(TJBot.prototype.defaultConfiguration);
 
 // List of all available languages
 TJBot.prototype.languages = {};
 TJBot.prototype.languages.listen = ['ar-AR', 'en-UK', 'en-US', 'es-ES', 'fr-FR', 'ja-JP', 'pt-BR', 'zh-CN'];
 TJBot.prototype.languages.speak = ['en-GB', 'en-US', 'es-US', 'ja-JP', 'pt-BR'];
 TJBot.prototype.languages.see = ['en','ar','de','es','it','ja','ko'];
 TJBot.prototype.genders = ['male', 'female'];
 
 /** ------------------------------------------------------------------------ */
 /** INTERNAL HARDWARE & WATSON SERVICE INITIALIZATION                        */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Configure the Camera.
  */
 TJBot.prototype._setupCamera = function() {
     winston.verbose("TJBot initializing Camera");
 
     this._camera = new Raspistill({
         width: this.configuration.see.camera.width,
         height: this.configuration.see.camera.height,
         noPreview: true,
         encoding: 'jpg',
         outputDir: './',
         verticalFlip: this.configuration.see.camera.verticalFlip,
         horizontalFlip: this.configuration.see.camera.horizontalFlip,
         time: 1
     });
 
     // versions of node-raspistill < 0.0.11 don't have the `time` option, so
     // force it in if we don't find it
     if (!this._camera.options.hasOwnProperty('time')) {
         winston.silly("node-raspistill camera option for `time` not found, swizzling it in");
         var self = this._camera;
         self.processOptionsOriginal = self.processOptions;
         self.processOptions = function(newOptions) {
             var options = self.processOptionsOriginal(newOptions);
             options.push('-t');
             options.push('1');
             return options;
         }
     }
 }
 
 /**
  * Configure the Neopixel LED supplied with original TJBot. The LED must be attached to the BCM 18 (PWM0) PIN.
  */
 TJBot.prototype._setupLED = function() {
     winston.verbose("TJBot initializing LED");
 
     var ws281x = require('rpi-ws281x-native');
 
     // init with 1 LED
     this._led = ws281x;
     this._led.init(1);
 
     // capture 'this' context
     var self = this;
 
     // reset the LED before the program exits
     process.on('SIGINT', function() {
         self._led.reset();
         process.nextTick(function() {
             process.exit(0);
         })
     });
 }
 
 /**
  * Configure the RGB Led supplied with TJBot CZ Edition.
  */
 TJBot.prototype._setupRGBLed = function() {
     winston.verbose("TJBot initializing RGB Led");
 
     this._basic_colors = ["red", "green", "blue", "yellow", "magenta", "cyan", "white"]
     var ledpins = {
       R : 17,
       G : 27,
       B : 22
     }
 
     var pinR = new gpio(ledpins.R, {mode: gpio.OUTPUT});
     var pinG = new gpio(ledpins.G, {mode: gpio.OUTPUT});
     var pinB = new gpio(ledpins.B, {mode: gpio.OUTPUT});
     this._RGBLed = {pinR, pinG, pinB}
 
     this._RGBLed.pulseTimer;
 }
 
 /**
  * Configure the microphone for speech recognition.
  */
 TJBot.prototype._setupMicrophone = function() {
     winston.verbose("TJBot initializing microphone");
 
     // capture 'this' context
     var self = this;
 
     var micParams = {
         'rate': '16000',
         'channels': '2',
         'debug': false,
         'exitOnSilence': 6
     };
 
     if (this.configuration.listen.microphoneDeviceId) {
         micParams.device = this.configuration.listen.microphoneDeviceId;
     }
 
     // create the microphone
     this._mic = Mic(micParams);
 
     // (re-)create the mic audio stream and pipe it to STT
     this._micInputStream = this._mic.getAudioStream();
 
     this._micInputStream.on('startComplete', function() {
         winston.debug("microphone started");
     });
 
     this._micInputStream.on('pauseComplete', function() {
         winston.debug("microphone paused");
     });
 
     // log errors in the mic input stream
     this._micInputStream.on('error', function(err) {
         winston.error("the microphone input stream experienced an error", err);
     });
 
     this._micInputStream.on('processExitComplete', function() {
         winston.debug("microphone exit");
     });
 
     // ignore silence
     this._micInputStream.on('silence', function() {
         winston.silly("microphone silence");
     });
 }
 
 /**
  * Configure the servo module for the given pin number.
  *
  * @param {Int} pin The pin number to which the servo is connected.
  */
 TJBot.prototype._setupServo = function(pin) {
     var Gpio = require('pigpio').Gpio;
 
     winston.verbose("TJBot initializing servo motor on PIN " + pin);
 
     this._motor = new Gpio(pin, {
         mode: Gpio.OUTPUT
     });
 }
 
 /**
  * Configure the speaker.
  */
 TJBot.prototype._setupSpeaker = function() {
     // lazily load the sound-player library . This lib is used as it allows specification of speakerDeviceId
     this._soundplayer = require('sound-player');
 }
 
 /**
  * Configure the specified Watson service with the given credentials.
  *
  * @param {String} service The name of the service. Valid names are 'speech_to_text', 'text_to_speech', 'tone_analyzer' .
  * @param {Object} credentials The credentials, with keys for '{service}_username' and '{service}_password'.
  */
 TJBot.prototype._createServiceAPI = function(service, credentials) {
     winston.verbose("TJBot initializing " + service + " service");
 
     assert(credentials, "no credentials found for the " + service + " service");
 
     // capture 'this' context
     var self = this;
 
     switch (service) {
         case 'assistant':
         assert(credentials.hasOwnProperty('iam_apikey'), "credentials for the " + service + " service missing");
          
             if (credentials['iam_apikey'] != undefined) {
             var AssistantV2 = require('ibm-watson/assistant/v2');
             var { IamAuthenticator } = require('ibm-watson/auth');
             this._assistant = new AssistantV2({
                 version: '2020-04-01',
                 authenticator: new IamAuthenticator({
                     apikey: credentials['iam_apikey'],
                   }),
                 serviceName: 'assistant',
                 url: credentials['url']
                 });
             } else {
                 throw new Error(
                 'Missing authentication credentials for Watson Assistant service: apikey, service url & assistant ID are required.');
             }
             // cache of conversation contexts. hash key is the workspaceId of the conversation,
             // allowing TJ to run multiple conversations at once.
             this._assistantContext = {};
             break;
 
         case 'language_translator':
             assert(credentials.hasOwnProperty('iam_apikey'), "credentials for the " + service + " service missing");
             if (credentials['iam_apikey'] != undefined) {
             var LanguageTranslatorV3 = require('ibm-watson/language-translator/v3');
             var { IamAuthenticator } = require('ibm-watson/auth');
             this._languageTranslator = new LanguageTranslatorV3({
                 authenticator: new IamAuthenticator({ 
                     apikey: credentials['iam_apikey'],
                     }),
                 version: '2018-05-01',
                 serviceUrl: credentials['url']
                 });
             } else {
                 throw new Error(
                 'Missing authentication credentials for translator service: apikey and url are required.');
             }
             // load the list of language models
             this._loadLanguageTranslations().then(function(translations) {
                 self._translations = translations;
             });
             break;
 
         case 'speech_to_text':
         assert(credentials.hasOwnProperty('iam_apikey'), "credentials for the " + service + " service missing");
 
         var SpeechToTextV1 = require('ibm-watson/speech-to-text/v1');
         var { IamAuthenticator } = require('ibm-watson/auth');
         if (credentials['iam_apikey'] != undefined) {
             this._stt = new SpeechToTextV1({
                 authenticator: new IamAuthenticator({apikey: credentials['iam_apikey']}),
                 serviceUrl: credentials['url']
             });
         } else {
             throw new Error(
             'Missing authentication credentials for text_to_speech service:  ' +
             'apikey required.');
         }
             break;
 
         case 'text_to_speech':
         assert(credentials.hasOwnProperty('iam_apikey'), "credentials for the " + service + " service missing");
 
         var TextToSpeechV1 = require('ibm-watson/text-to-speech/v1');
         var { IamAuthenticator } = require('ibm-watson/auth');
 
                if (credentials['iam_apikey'] != undefined) {
                     this._tts = new TextToSpeechV1({
                         authenticator: new IamAuthenticator({apikey: credentials['iam_apikey']}),
                         serviceUrl: credentials['url']
                     });
             } else {
                     throw new Error(
                     'Missing authentication credentials for text_to_speech service: username/password or ' +
                     'apikey are required.');
             }
 
             this._tts.listVoices(null, function(error, data) {
                 if (error) {
                     winston.error("unable to retrieve TTS voices", error);
                     self._ttsVoices = [];
                 } else {
                     self._ttsVoices = data.voices;
                 }
             });
             break;
 
         case 'tone_analyzer':
         assert(credentials.hasOwnProperty('iam_apikey'), "credentials for the " + service + " service missing");
             
             if (credentials['iam_apikey'] != undefined) {
             var ToneAnalyzerV3 = require('ibm-watson/tone-analyzer/v3');
             this._toneAnalyzer = new ToneAnalyzerV3({
                 version: '2017-09-21',
                 authenticator: new IamAuthenticator({
                    apikey: credentials['iam_apikey'],
                  }),
                  serviceUrl: credentials['url']
                 });
 
            }  else {
                 throw new Error('Missing authentication credentials for tone analyzer service: apikey are required.');
             }
             
             break;
         
         case 'visual_recognition':
             assert(credentials.hasOwnProperty('iam_apikey') && credentials.hasOwnProperty('apiSecret'), "credentials for the " + service + " service missing 'api_key' or 'iam_apikey'");

             break;
         
         default:
             break;
     }
 }
 
 /**
  * Assert that TJBot is able to perform a specified capability.
  *
  * @param {String} capability The capability assert (see TJBot.prototype.capabilities).
  */
 TJBot.prototype._assertCapability = function(capability) {
     switch (capability) {
         case 'analyze_tone':
             if (!this._toneAnalyzer) {
                 throw new Error(
                     'TJBot is not configured to analyze tone. ' +
                     'Please check that you included credentials for the Watson Tone Analyzer service.');
             }
             break;
 
         case 'converse':
             if (!this._assistant) {
                 throw new Error(
                     'TJBot is not configured to converse. ' +
                     'Please check that you included credentials for the Watson "assistant" service in the TJBot constructor.');
             }
             break;
 
         case 'listen':
             if (!this._mic) {
                 throw new Error(
                     'TJBot is not configured to listen. ' +
                     'Please check you included the "microphone" hardware in the TJBot constructor.');
             }
             if (!this._stt) {
                 throw new Error(
                     'TJBot is not configured to listen. ' +
                     'Please check that you included credentials for the Watson "speech_to_text" service in the TJBot constructor.');
             }
             break;
 
         case 'see':
             if (!this._camera) {
                 throw new Error(
                     'TJBot is not configured to see. ' +
                     'Please check you included the "camera" hardware in the TJBot constructor.');
             }

             break;
 
         case 'shine':
             if (!this._led) {
                 throw new Error(
                     'TJBot is not configured with an LED. ' +
                     'Please check you included the "led" hardware in the TJBot constructor.');
             }
             break;
 
         case 'speak':
             if (!this._soundplayer) {
                 throw new Error(
                     'TJBot is not configured to speak. ' +
                     'Please check you incldued the "speaker" hardware in the TJBot constructor.');
             }
             if (!this._tts) {
                 throw new Error(
                     'TJBot is not configured to speak. ' +
                     'Please check you included credentials for the Watson "text_to_speech" service in the TJBot constructor.');
             }
             break;
 
         case 'translate':
             if (!this._languageTranslator) {
                 throw new Error(
                     'TJBot is not configured to translate. ' +
                     'Please check you included credentials for the Watson "language_translator" service in the TJBot constructor.');
             }
             break;
 
         case 'wave':
             if (!this._motor) {
                 throw new Error(
                     'TJBot is not configured with an arm. ' +
                     'Please check you included the "servo" hardware in the TJBot constructor.');
             }
             break;
     }
 }
 
 /** ------------------------------------------------------------------------ */
 /** UTILITY METHODS                                                          */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Put TJBot to sleep.
  *
  * @param {Int} msec Number of milliseconds to sleep for (1000 msec == 1 sec).
  */
 TJBot.prototype.sleep = function(msec) {
     var usec = msec * 1000;
     sleep.usleep(usec);
 }
 
 /** ------------------------------------------------------------------------ */
 /** ANALYZE TONE                                                             */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Analyze the tone of the given text.
  *
  * @param {String} text The text to analyze.
  */
 TJBot.prototype.analyzeTone = async function(mytext) {
     this._assertCapability('analyze_tone');
 
     var self = this;
 
     const toneParams = {
         toneInput: mytext,
         contentType: 'application/json',
     }
 
     try {
         const body = await this._toneAnalyzer.tone(toneParams);
         winston.silly(`response from _toneAnalyzer.tone(): ${body}`);
         return body.result;
 
     } catch (err) {
         winston.error(`the tone analyzer service returned an error.`, err);
         throw err;
 
     }
 
 }
 
 ///** ------------------------------------------------------------------------ */
 ///** CONVERSE                                                                 */
 ///** ------------------------------------------------------------------------ */
 //
 ///**
 // * Take a conversational turn in the given Watson conversation.
 // *//
 // * @param {String} workspaceId The id of the workspace to use in the Assistant service.
 // * @param {String} message The message to send to the Assistant service.
 // * 
 // * Returns a conversation response object.
 // *
 // */
 //TJBot.prototype.converse = function(workspaceId, message, callback) {
 //    this._assertCapability('converse');
 //
 //    // save the conversational context
 //    if (this._assistantContext[workspaceId] == undefined) {
 //        this._assistantContext[workspaceId] = {};
 //    }
 //
 //    var context = this._assistantContext[workspaceId];
 //
 //    // define the conversational turn
 //    var turn = {
 //        workspace_id: workspaceId,
 //        input: {
 //            'text': message
 //        },
 //        context: context
 //    };
 //
 //    // capture context
 //    var self = this;
 //
 //    // send to Conversation service
 //    this._assistant.message(turn, function(err, response) {
 //        if (err) {
 //            winston.error("the assistant service returned an error.", err);
 //        } else {
 //            // cache the returned context
 //            self._assistantContext[workspaceId] = response.context;
 //
 //            // return the response object and response text
 //            var responseText = response.output.text.length > 0 ? response.output.text[0] : "";
 //            var assistantResponse = {
 //                "object": response,
 //                "description": responseText
 //            };
 //
 //            // log response text
 //            winston.verbose("TJBot response from conversation workspace id " + workspaceId + " " + responseText + " :");
 //            callback(assistantResponse);
 //        }
 //    });
 //}
 
 /** ------------------------------------------------------------------------ */
 /** CONVERSE - TJBOT CZ VERSION                                                                */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Take a conversational turn in the given Watson conversation.
  *
  * @param {String} workspaceId The id of the workspace to use in the Assistant service.
  * @param {String} message The message to send to the Assistant service.
  * @param {String} context Adhoc context object  
  * @param {String} session sessionId  
  *
  * Returns a conversation api response object
  */
 TJBot.prototype.sessionId = async function(workspaceId){
         
         const sessionParams = {
             assistantId: workspaceId
         }
 
         try {
             const body = await this._assistant.createSession(sessionParams)
             const session = body.result.session_id;
             return session;
 
         } catch (err) {
             winston.silly ('error creating session');
             throw err;
         }
            
 }
 
 TJBot.prototype.converse = async function(workspaceId, session, message, context) {
     this._assertCapability('converse');
 
     /* save the conversational context
     if (this._assistantContext[workspaceId] == undefined) {
         this._assistantContext[workspaceId] = {};
     }
     */
     
     //var context = this._assistantContext[workspaceId];
 
     // define the conversational turn
     const turn = {
         assistantId: workspaceId,
         sessionId: session,
         input: {
             'message_type': 'text',
             'text': message,
             'options': {
                 'return_context': true
             }
         },
         context: context
     };
     // capture context
     var self = this;
     
     try {
         const body = await this._assistant.messageStateless(turn);
         const responseText = body.result.output.generic.length > 0 ? body.result.output.generic[0].text : "";
         var assistantResponse = {
             "object": body.result,
             "description": responseText
         };
         winston.info("TJBot response from conversation workspace id " + workspaceId + ": " + responseText);
         return assistantResponse;
 
 
     } catch (err) {
         winston.silly('the assistant service returned an error');
         throw err;
 
     }
 
 
 
 /*
     // send to Conversation service
     this._assistant.messageStateless(turn)
     .then(response => {
         //console.log(JSON.stringify(response.result, null, 2));
         //self._assistantContext[workspaceId] = response.result.context.skills['main skill'].user_defined;
             // return the response object and response text
             var responseText = response.result.output.generic.length > 0 ? response.result.output.generic[0].text : "";
             var assistantResponse = {
                 "object": response.result,
                 "description": responseText,
                 //"context": response.result.context.skills['main skill'].user_defined
             };
             // log response text
             winston.info("TJBot response from conversation workspace id " + workspaceId + ": " + responseText);
             callback(assistantResponse);
         })
         .catch(err => {
             winston.error("the assistant service returned an error.", err);
         });
 
         */
    
     /* send to Conversation service
     this._assistant.message(turn, function(err, response) {
         console.log("odeslano na WA");
         if (err) {
             winston.error("the assistant service returned an error.", err);
         } else {
             //console.log(JSON.stringify(response));
             // cache the returned context
             self._assistantContext[workspaceId] = response.context;
 
             // return the response object and response text
             var responseText = response.output.text.length > 0 ? response.output.text.values[0] : "";
             var assistantResponse = {
                 "object": response,
                 "description": responseText
             };
 
             // log response text
             winston.verbose("TJBot response from conversation workspace id " + workspaceId + " " + responseText + " :");
             callback(assistantResponse);
         }
     });
     */
 }
 
 /** ------------------------------------------------------------------------ */
 /** LISTEN                                                                   */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Listen for spoken utterances.
  */
 
 
  TJBot.prototype.listen =  function (callback) {
 
     // make sure we can listen
     this._assertCapability('listen');
 
     // capture 'this' context
     var self = this;
 
     // (re)initialize the microphone because if stopListening() was called, we don't seem to
     // be able to re-use the microphone twice
     this._setupMicrophone();
 
         // create the microphone -> STT recognizer stream
     // see this page for additional documentation on the STT configuration parameters:
     // https://www.ibm.com/watson/developercloud/speech-to-text/api/v1/#recognize_audio_websockets
     if(this.configuration.listen.customization_id){
         winston.debug("Customization_id is set.");
         this._micRecognizeStream = this._stt.recognizeUsingWebSocket({
             content_type: 'audio/l16; rate=16000; channels=1',
             interimResults: true, // need 'true' for watson-developer-cloud 3.x, otherwise results don't come back
             inactivityTimeout: this.configuration.listen.inactivityTimeout,
             model: this.configuration.listen.language + "_NarrowbandModel",
             backgroundAudioSuppression: this.configuration.listen.backgroundAudioSuppression || 0.0, // should be in the range [0.0, 1.0] indicating how much audio suppression to perform
             customization_id: this.configuration.listen.customization_id
         });
       } else {
         winston.debug("Customization_id is not set.");
         this._micRecognizeStream = this._stt.recognizeUsingWebSocket({
             content_type: 'audio/l16; rate=16000; channels=2',
             interimResults: true, // need 'true' for watson-developer-cloud 3.x, otherwise results don't come back
             inactivityTimeout: this.configuration.listen.inactivityTimeout,
             model: this.configuration.listen.language + "_NarrowbandModel",
             backgroundAudioSuppression: this.configuration.listen.backgroundAudioSuppression || 0.0 // should be in the range [0.0, 1.0] indicating how much audio suppression to perform
         });
       }
 
       // create the mic -> STT recognizer -> text stream
     this._sttTextStream = this._micInputStream.pipe(this._micRecognizeStream);
     this._sttTextStream.setEncoding('utf8');
 
     // start the microphone
     this._mic.start();
 
     // handle errors in the text stream
 
 
 
     this._sttTextStream.on('error', function(err) {
         if (err) {
             winston.error("the speech_to_text service returned an error.", err);
 
             // resume the microphone
             self.resumeListening();
 
             // attempt to reconnect
             self.listen(callback);
         }
     });
 
 
 
     // deliver STT data to the callback
     this._sttTextStream.on('data', function(transcript) {
         winston.info("TJBot heard: " + transcript);
 
         if (callback != undefined) {
             callback(transcript);
         }
     });
  
 
  }
 
 
 /*
 
 TJBot.prototype.listen = function(callback) {
     // make sure we can listen
     this._assertCapability('listen');
 
     // capture 'this' context
     var self = this;
 
     // (re)initialize the microphone because if stopListening() was called, we don't seem to
     // be able to re-use the microphone twice
     this._setupMicrophone();
 
     // create the microphone -> STT recognizer stream
     // see this page for additional documentation on the STT configuration parameters:
     // https://www.ibm.com/watson/developercloud/speech-to-text/api/v1/#recognize_audio_websockets
     if(this.configuration.listen.customization_id){
       winston.debug("Customization_id is set.");
       this._micRecognizeStream = this._stt.recognizeUsingWebSocket({
           content_type: 'audio/l16; rate=16000; channels=1',
           interimResults: true, // need 'true' for watson-developer-cloud 3.x, otherwise results don't come back
           inactivityTimeout: this.configuration.listen.inactivityTimeout,
           model: this.configuration.listen.language + "_NarrowbandModel",
           backgroundAudioSuppression: this.configuration.listen.backgroundAudioSuppression || 0.0, // should be in the range [0.0, 1.0] indicating how much audio suppression to perform
           customization_id: this.configuration.listen.customization_id
       });
     } else {
       winston.debug("Customization_id is not set.");
       this._micRecognizeStream = this._stt.recognizeUsingWebSocket({
           content_type: 'audio/l16; rate=16000; channels=2',
           interimResults: true, // need 'true' for watson-developer-cloud 3.x, otherwise results don't come back
           inactivityTimeout: this.configuration.listen.inactivityTimeout,
           model: this.configuration.listen.language + "_NarrowbandModel",
           backgroundAudioSuppression: this.configuration.listen.backgroundAudioSuppression || 0.0 // should be in the range [0.0, 1.0] indicating how much audio suppression to perform
       });
     }
 
     // create the mic -> STT recognizer -> text stream
     this._sttTextStream = this._micInputStream.pipe(this._micRecognizeStream);
     this._sttTextStream.setEncoding('utf8');
 
 
     // handle errors in the text stream
     this._sttTextStream.on('error', function(err) {
         if (err) {
             winston.error("the speech_to_text service returned an error.", err);
 
             // resume the microphone
             self.resumeListening();
 
             // attempt to reconnect
             self.listen(callback);
         }
     });
 
     // deliver STT data to the callback
     this._sttTextStream.on('data', function(transcript) {
         winston.info("TJBot heard: " + transcript);
 
         if (callback != undefined) {
             callback(transcript);
         }
     });
 
     // start the microphone
     this._mic.start();
 }
 */
 
 /**
  * Pause listening for spoken utterances
  */
 TJBot.prototype.pauseListening = function() {
     // make sure we can listen
     this._assertCapability('listen');
 
     // pause the mic
     this._pauseListening();
 }
 
 /**
  * Internal method for pausing listening, used when
  * we want to play a sound but we don't want to assert
  * the 'listen' capability.
  */
 TJBot.prototype._pauseListening = function() {
     if (this._mic != undefined) {
         winston.debug("listening paused");
         this._mic.pause();
     }
 }
 
 /**
  * Resume listening for spoken utterances
  */
 TJBot.prototype.resumeListening = function() {
     // make sure we can listen
     this._assertCapability('listen');
 
     // resume the mic
     this._resumeListening();
 }
 
 /**
  * Internal method for resuming listening, used when
  * we want to play a sound but we don't want to assert
  * the 'listen' capability.
  */
 TJBot.prototype._resumeListening = function() {
     if (this._mic != undefined) {
         winston.debug("listening resumed");
         this._mic.resume();
     }
 }
 
 /**
  * Stop listening for spoken utterances
  */
 TJBot.prototype.stopListening = function() {
     // make sure we can listen
     this._assertCapability('listen');
 
     // stop the mic
     this._stopListening();
 }
 
 /**
  * Internal method for stopping listening, used when
  * we want to stop listening but we don't want to assert
  * the 'listen' capability.
  */
 TJBot.prototype._stopListening = function() {
     if (this._mic != undefined) {
         winston.debug("listening stopped");
 
         // stop the mic
         this._mic.stop();
 
         // sleep for 1 second to wait for the mic to finish closing. this seems
         // necessary for a subsequent call to listen() to work correctly.
         this.sleep(1000);
     }
 }
 
 /** ------------------------------------------------------------------------ */
 /** SEE                                                                      */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Take a picture and identify the objects present. *
  * Returns a list of objects seen and their confidences.
  * See VisualRecognitionV3.prototype.classify for more detail on the
  * return object.
  */
 TJBot.prototype.see = function() {
     this._assertCapability('see');
 
     // capture 'this' context
     var self = this;
 
     return new Promise(function(resolve, reject) {
         winston.verbose("TJBot taking a photo");
         self.takePhoto().then(function(filePath) {
             resolve(self.recognizeObjectsInPhoto(filePath))
         });
     });
 }
 
 /**
  * Describe photo by sending it to the Watson Visual Recognition Service.
  */
 TJBot.prototype.recognizeObjectsInPhoto = async function(filePath, credentials) {
     this._assertCapability('see');
 
     // capture 'this' context
     var self = this;
 
     //return new Promise(function(resolve, reject) {
         winston.info("Sending image to Imagga Visual Recognition...");
 
         const apiKey = credentials['iam_apikey'];
         const apiSecret = credentials['apiSecret'];
         const formData = new FormData();
 
         formData.append('image', fs.createReadStream(filePath));
         console.log (apiKey, apiSecret, filePath);
        
         try {
             const response = await got.post('https://api.imagga.com/v2/tags', {body: formData, username:apiKey, password:apiSecret});
             //console.log(response.body);
             return response;
             
         } catch (error) {
             console.log(error);
         }       
 }
 
 
 /**
  * Capture an image and save it in the given path. If no path is provided, 
  * it saves this file to a temp location.
  *
  * @param {String} filePath The path at which to save the image.
  *
  * Returns the photo data in a Buffer.
  */
 TJBot.prototype.takePhoto = function(filePath) {
     this._assertCapability('see');
 
     // capture 'this' context
     var self = this;
     var path = "";
     var name = "";
 
     // if no file path provided, save to temp location
     if (filePath == null || filePath == "") {
         filePath = temp.path({
             prefix: 'tjbot'
         });
     };
 
     winston.debug("capturing image at path: " + filePath);
     path = filePath.lastIndexOf("/") > 0 ? filePath.substring(0, filePath.lastIndexOf("/")) : ""; // save to current dir if no directory provided.
     name = filePath.substring(filePath.lastIndexOf("/") + 1);
     name = name.replace(".jpg", ""); // the node raspistill lib already adds encoding .jpg to file.
 
     // set the configuration options, which may have changed since the camera was initialized
     this._camera.setOptions({
         outputDir: path,
         fileName: name,
         width: this.configuration.see.camera.width,
         height: this.configuration.see.camera.height,
         verticalFlip: this.configuration.see.camera.verticalFlip,
         horizontalFlip: this.configuration.see.camera.horizontalFlip
     });
 
     return new Promise(function(resolve, reject) {
         self._camera.takePhoto().then(function(photobuffer) {
             var returnPath = path == "" ? (name + "." + self._camera.getOptions().encoding) : (path + "/" + name + "." + self._camera.getOptions().encoding);
             resolve(returnPath);
         }).catch(function(error) {
             winston.error('Error taking picture.', error);
             reject(error);
         });
     })
 }
 
 /** ------------------------------------------------------------------------ */
 /** RGB LED - TJBOT CZ FEATURE                                               */
 /** ------------------------------------------------------------------------ */
 
 
 //helper
 function led_turn_on(led){
   led.digitalWrite(1);
 }
 //helper
 function led_turn_off(led){
   led.digitalWrite(0);
 }
 
 /**
  * Turn on RGB on random color
  */
 TJBot.prototype.turnOnRGBLed = function(callback){ 
     this.changeColorRGBLed("random", function(color){
       callback(color);
     });
 }
 
 /**
  * Turn off all RGB colors
  *
  */
 TJBot.prototype.turnOffRGBLed = function() {
     led_turn_off(this._RGBLed.pinR);
     led_turn_off(this._RGBLed.pinG);
     led_turn_off(this._RGBLed.pinB);
 }
 
 /**
  * Change the color of the RGB led.
  *
  * @param {String} color The color to use. Must be from list of _basic_colors.
  */
 TJBot.prototype.changeColorRGBLed = function(color, callback) {
     switch (color){
      case "red":
       led_turn_on(this._RGBLed.pinR);
       led_turn_off(this._RGBLed.pinG);
       led_turn_off(this._RGBLed.pinB);
       break;
      case "green":
       led_turn_off(this._RGBLed.pinR);
       led_turn_on(this._RGBLed.pinG);
       led_turn_off(this._RGBLed.pinB);
       break;
      case "blue":
       led_turn_off(this._RGBLed.pinR);
       led_turn_off(this._RGBLed.pinG);
       led_turn_on(this._RGBLed.pinB);
       break;
      case "yellow":
       led_turn_on(this._RGBLed.pinR);
       led_turn_on(this._RGBLed.pinG);
       led_turn_off(this._RGBLed.pinB);
       break;
      case "magenta":
       led_turn_on(this._RGBLed.pinR);
       led_turn_off(this._RGBLed.pinG);
       led_turn_on(this._RGBLed.pinB);
       break;
      case "cyan":
       led_turn_off(this._RGBLed.pinR);
       led_turn_on(this._RGBLed.pinG);
       led_turn_on(this._RGBLed.pinB);
       break;
      case "white":
       led_turn_on(this._RGBLed.pinR);
       led_turn_on(this._RGBLed.pinG);
       led_turn_on(this._RGBLed.pinB);
       break;
      case "random":
       var randIdx = Math.floor(Math.random() * this._basic_colors.length);
       color = this._basic_colors[randIdx];
       this.changeColorRGBLed(color, function(color){});
       break;
      default:
       winston.error("Unknowen color.");
       callback(null);
     }
     callback(color);
 }
 
 /**
  * Start pulsing led (if led is on).
  *
  * @param {context} is context object 
 */
 TJBot.prototype.pulseOnRGBLed = function(context, callback) {
     if (context.ledPulsing) 
         return  callback(null); // otherwise we would start several pulses...
     if (!context.ledOn) {
         return  callback(null); //we have no color to pulse...
     }
 
     var dutyCycle = 0;
     var self = this;
     self._RGBLed.pulseTimer = setInterval(function () {
     var color = context.ledColor;
     if (color == "red" || color == "yellow" || color == "magenta" || color == "white") self._RGBLed.pinR.pwmWrite(dutyCycle);
     if (color == "green" || color == "yellow" || color == "cyan" || color == "white")  self._RGBLed.pinG.pwmWrite(dutyCycle);
     if (color == "blue" || color == "magenta" || color == "cyan" || color == "white")  self._RGBLed.pinB.pwmWrite(dutyCycle);
 
     dutyCycle += 5;
     if (dutyCycle > 255) {
       dutyCycle = 0;
     }
   }, 20);
   callback(true);
 }
 
 /**
  * Stop pulsing.
  */
 TJBot.prototype.pulseOffRGBLed = function() {
   clearInterval(this._RGBLed.pulseTimer);
 }
 
 
 /** ------------------------------------------------------------------------ */
 /** SHINE                                                                    */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Change the color of the LED.
  *
  * @param {String} color The color to use. Must be interpretable by TJBot.prototype._normalizeColor.
  */
 TJBot.prototype.shine = function(color) {
     this._assertCapability('shine');
 
     // convert to rgb
     var rgb = this._normalizeColor(color);
 
     // convert hex to the 0xGGRRBB format for the LED
     var grb = "0x" + rgb[3] + rgb[4] + rgb[1] + rgb[2] + rgb[5] + rgb[6];
 
     // shine!
     winston.verbose("TJBot shining my LED to RGB color " + rgb);
 
     // set the LED color
     var colors = new Uint32Array(1);
     colors[0] = parseInt(grb);
     this._led.render(colors);
 }
 
 /**
  * Pulse the LED a single time.
  * @param {String} color The color to pulse the LED.
  * @param {Integer} duration The duration the pulse should last (default = 1 second, should be between 0.5 and 3 seconds)
  */
 TJBot.prototype.pulse = function(color, duration = 1.0) {
     this._assertCapability('shine');
 
     if (duration < 0.5) {
         throw new Error("TJBot does not recommend pulsing for less than 0.5 seconds.");
     }
     if (duration > 2.0) {
         throw new Error("TJBot does not recommend pulsing for more than 3 seconds.");
     }
 
     // number of easing steps
     var numSteps = 20;
 
     // quadratic in-out easing
     var easeInOutQuad = function(t, b, c, d) {
         if ((t /= d / 2) < 1) return c / 2 * t * t + b;
         return -c / 2 * ((--t) * (t - 2) - 1) + b;
     }
 
     var ease = [];
     for (var i = 0; i < numSteps; i++) {
         ease.push(i);
     }
 
     ease = ease.map(function(x, i) {
         return easeInOutQuad(i, 0, 1, ease.length);
     });
 
     // normalize to 'duration' msec
     ease = ease.map(function(x) {
         return Math.round(x * duration * 1000)
     });
 
     // convert to deltas
     var easeDelays = [];
     for (var i = 0; i < ease.length - 1; i++) {
         easeDelays[i] = ease[i + 1] - ease[i];
     }
 
     // color ramp
     var rgb = this._normalizeColor(color).slice(1); // remove the #
     var hex = new cm.HexRgb(rgb);
 
     var colorRamp = [];
     for (var i = 0; i < numSteps / 2; i++) {
         var l = 0.0 + (i / (numSteps / 2)) * 0.5;
         colorRamp[i] = hex.toHsl().lightness(l).toRgb().toHexString().replace('#', '0x');
     }
 
     // capture context
     var self = this;
 
     // perform the ease
     return new Promise(function(resolve, reject) {
         for (var i = 0; i < easeDelays.length; i++) {
             var color = i < colorRamp.length ?
                 colorRamp[i] :
                 colorRamp[colorRamp.length - 1 - (i - colorRamp.length) - 1];
             self.shine(color);
             self.sleep(easeDelays[i]);
         }
         resolve();
     });
 }
 
 /**
  * Get the list of colors recognized by TJBot.
  */
 TJBot.prototype.shineColors = function() {
     this._assertCapability('shine');
 
     return colorToHex.all().map(function(elt, i, array) {
         return elt['name'];
     });
 }
 
 /**
  * Get a random color.
  */
 TJBot.prototype.randomColor = function() {
     this._assertCapability('shine');
 
     var colors = this.shineColors();
     var randIdx = Math.floor(Math.random() * colors.length);
     var randColor = colors[randIdx];
 
     return randColor;
 }
 
 /**
  * Normalize the given color to #RRGGBB.
  *
  * @param {String} color The color to normalize. May be a hex number (e.g. "0xF12AC4", "11FF22", "#AABB24"), "on", "off", or "random", or a named color as interpreted by the `colornames` package. Hex numbers follow an RRGGBB format.
  */
 TJBot.prototype._normalizeColor = function(color) {
     // assume undefined == "off"
     if (color == undefined) {
         color = "off";
     }
 
     // is this "on" or "off"?
     if (color == "on") {
         color = "FFFFFF";
     } else if (color == "off") {
         color = "000000";
     } else if (color == "random") {
         color = this.randomColor();
     }
 
     // strip prefixes if they are present
     if (color.startsWith('0x')) {
         color = color.slice(2);
     }
 
     if (color.startsWith('#')) {
         color = color.slice(1);
     }
 
     // is this a hex number or a named color?
     var isHex = /(^[0-9A-F]{6}$)|(^[0-9A-F]{3}$)/i;
     var rgb = undefined;
 
     if (!isHex.test(color)) {
         rgb = colorToHex(color);
     } else {
         rgb = color;
     }
 
     // did we get something back?
     if (rgb == undefined) {
         throw new Error('TJBot did not understand the specified color "' + color + '"');
     }
 
     // prefix rgb with # in case it's not
     if (!rgb.startsWith('#')) {
         rgb = '#' + rgb;
     }
 
     // throw an error if we didn't understand this color
     if (rgb.length != 7) {
         throw new Error('TJBot did not understand the specified color "' + color + '"');
     }
 
     return rgb;
 }
 
 /** ------------------------------------------------------------------------ */
 /** SPEAK                                                                    */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Speak the given message.
  *
  * @param {String} message The message to speak.
  */
  TJBot.prototype.speak = async function (message) {
     this._assertCapability('speak');
 
     // make sure we're trying to say something
     if (message == undefined || message == "") {
         winston.error("TJBot tried to speak an empty message.");
         return; // exit if theres nothing to say!
     }
 
     // load voices if they haven't been loaded yet
     if (!this._ttsVoices) {
         winston.verbose('loading TTS voices…');
         const body = await this._tts.listVoices();
         winston.silly(`response from _tts.listVoices(): ${JSON.stringify(body)}`);
         this._ttsVoices = body.result.voices;
         winston.verbose('TTS voices loaded');
     }
 
     // default voice
     let voice = 'en-US_MichaelV3Voice';
 
      // check to see if the user has specified a voice
      if (this.configuration.speak.voice != undefined) {
         voice = this.configuration.speak.voice;
     } else {
         // choose a voice based on robot.gender and speak.language
         // do this each time just in case the user changes robot.gender or
         // speak.language during execution
         for (var i in this._ttsVoices) {
             if (this._ttsVoices[i]["language"] == this.configuration.speak.language &&
                 this._ttsVoices[i]["gender"] == this.configuration.robot.gender) {
                 voice = this._ttsVoices[i]["name"];
                 break;
             }
         }
     }
     
     winston.verbose("TJBot speaking with voice " + voice);
 
     var utterance = {
         text: message,
         voice: voice,
         accept: 'audio/mp3'
     };
     
     const info = temp.openSync('tjbot');
     const response = await this._tts.synthesize(utterance);
 
     // pipe the audio buffer to a file
     winston.silly('writing audio buffer to temp file', info.path);
     const fd = fs.createWriteStream(info.path);
     response.result.pipe(fd);
 
     // wait for the pipe to finish writing
     const end = new Promise((resolve, reject) => {
         fd.on('close', resolve);
         fd.on('error', reject);
     });
     await end;
 
     // now play it
     winston.info(`TJBot speaking: ${message}`);
     await this.play(info.path);
 
 }
 
 
 
 /*
 
 TJBot.prototype.speak = function(message) {
     this._assertCapability('speak');
 
     // make sure we're trying to say something
     if (message == undefined || message == "") {
         winston.error("TJBot tried to speak an empty message.");
         return; // exit if theres nothing to say!
     }
 
     // default voice
     var voice = "en-US_MichaelVoice";
 
     // check to see if the user has specified a voice
     if (this.configuration.speak.voice != undefined) {
         voice = this.configuration.speak.voice;
     } else {
         // choose a voice based on robot.gender and speak.language
         // do this each time just in case the user changes robot.gender or
         // speak.language during execution
         for (var i in this._ttsVoices) {
             if (this._ttsVoices[i]["language"] == this.configuration.speak.language &&
                 this._ttsVoices[i]["gender"] == this.configuration.robot.gender) {
                 voice = this._ttsVoices[i]["name"];
                 break;
             }
         }
     }
 
     winston.verbose("TJBot speaking with voice " + voice);
 
     var utterance = {
         text: message,
         voice: voice,
         accept: 'audio/mp3'
     };
 
     // capture 'this' context
     var self = this;
 
     return new Promise(function(resolve, reject) {
         temp.open('tjbot', function(err, info) {
             if (err) {
                 reject("error: could not open temporary file for writing at path: " + info.path);
             }
 
             self._tts.synthesize(utterance, function(err,audio){
                 if (err) {
                     console.log(err);
                     return;
                 }
                 fs.writeFileSync(info.path, audio);
                 resolve(self.play(info.path));
                 });
         });
     });
 }
 */
 
 /**
  * Play a given sound file.
  *
  * @param {String} soundFile The sound file to be played .
  */
 
  TJBot.prototype.play = async function(soundFile){
 
     var self = this;
 
     // pause listening while we play a sound -- using the internal
     // method to avoid a capability check (and potential fail if the TJBot
     // isn't configured to listen)
     self._pauseListening();
 
     // if we don't have a speaker, throw an error
     if (this._soundplayer === undefined) {
         throw new Error('unable to play audio, TJBot hardware doesn\'t include a "speaker"');
     }
 
     var speakerOptions = {
         filename: soundFile,
         //gain: 100,
         debug: true,
         player: "mpg123", // "afplay" "aplay" "mpg123" "mpg321"
         device: self.configuration.speak.speakerDeviceId
     }
 
     var player = new self._soundplayer(speakerOptions);
 
     winston.debug("Playing audio with parameters: ", speakerOptions);
 
     // capture 'this' context
     player.on('complete', () => {
         winston.silly('audio playback finished');
 
         // resume listening
         self._resumeListening();
     });
 
     player.on('error', (err) => {
         winston.error('error occurred while playing audio', err);
     });
 
     // play the audio
     player.play(soundFile);
 
     // wait for the audio to finish playing, either by completing playback or by throwing an error
     //await Promise.race([once(player, 'complete'), once(player, 'error')]);
 
 
 }
 
 
 /*
 TJBot.prototype.play = function(soundFile) {
     // capture 'this' context
     var self = this;
 
     // pause listening while we play a sound -- using the internal
     // method to avoid a capability check (and potential fail if the TJBot
     // isn't configured to listen)
     self._pauseListening();
 
     return new Promise(function(resolve, reject) {
         // if we don't have a speaker, throw an error
         if (self._soundplayer == undefined) {
             reject(new Error("unable to play audio, TJBot hardware doesn't include a \"speaker\""));
             return;
         }
 
         // initialize soundplayer lib
         var speakerOptions = {
             filename: soundFile,
             gain: 100,
             debug: true,
             player: "mpg123", // "afplay" "aplay" "mpg123" "mpg321"
             device: self.configuration.speak.speakerDeviceId
         }
         var player = new self._soundplayer(speakerOptions);
 
         winston.debug("Playing audio with parameters: ", speakerOptions);
 
         player.on('complete', function() {
             winston.debug("audio playback finished");
 
             // resume listening
             self._resumeListening();
 
             // done
             resolve();
         });
 
         player.on('error', function(err) {
             winston.error('Error occurred while playing audio :', err);
         });
 
         // play the audio
         player.play(soundFile);
     });
 }
 
 */
 
 
 /** ------------------------------------------------------------------------ */
 /** TRANSLATE                                                                */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Translates the given tesxt from the source language to the target language.
  *
  * @param {String} text The text to translate.
  * @param {String} sourceLanguage The source language (e.g. "en" for English)
  * @param {String} targetLanguage The target language (e.g. "es" for Spanish)
  */
 TJBot.prototype.translate = async function(mytext, sourceLanguage, targetLanguage) {
     this._assertCapability('translate');
 
     // capture 'this' context
     var self = this;
 
     const translateParams = {
         text: mytext,
         source: sourceLanguage,
         target: targetLanguage
     }
 
     try {
         const body = await this._languageTranslator.translate(translateParams);
         winston.silly(`response from _languageTranslator.translate(): ${JSON.stringify(body)}`);
         translation = body.result;
     } catch (err) {
         winston.error('the language translator service returned an error', err);
         throw err;
     }
 
     return translation;
 }
 
 /**
  * Identifies the language of the given text.
  *
  * @param {String} mytext The text to identify.
  *
  * Returns a list of identified languages in the text.
  */
 TJBot.prototype.identifyLanguage = async function(mytext) {
     this._assertCapability('translate');
 
     // capture 'this' context
     var self = this;
     const identifyParams = {
         text: mytext
       };
 
     try {
         const body = await this._languageTranslator.identify(identifyParams);
         winston.silly(`response from _langaugeTranslator.identify(): ${JSON.stringify(body)}`);
         identifiedLanguages = body.result;
 
     } catch (err) {
         winston.error(`the ${TJBot.SERVICES.LANGUAGE_TRANSLATOR} service returned an error`, err);
         throw err;
     }
 
     return identifiedLanguages;
 }
 
 
 
 /**
  * Determines if TJBot can translate from the source language to the target language.
  *
  * @param {String} sourceLanguage The source language (e.g. "en" for English)
  * @param {String} targetLanguage The target language (e.g. "es" for Spanish)
  *
  * Returns a Promise that resolves to whether the sourceLanguage can be translated
  * to the targetLanguage.
  */
 TJBot.prototype.isTranslatable = function(sourceLanguage, targetLanguage) {
     this._assertCapability('translate');
 
     // capture 'this' context
     var self = this;
 
     // load the list of language models available for translation
     if (this._translations == undefined) {
         return this._loadLanguageTranslations().then(function(translations) {
             self._translations = translations;
             return self._isTranslatable(sourceLanguage, targetLanguage);
         });
     } else {
         return new Promise(function(resolve, reject) {
             resolve(self._isTranslatable(sourceLanguage, targetLanguage));
         });
     }
 }
 
 /**
  * Loads the list of language models that can be used for translation.
  */
 TJBot.prototype._loadLanguageTranslations = async function() {
     // capture 'this' context
     var self = this;
     let models;
     try {
         const body = await this._languageTranslator.listModels({});
         winston.silly(`response from _languageTranslator.listModels(): ${JSON.stringify(body)}`);
         models = body.result;
     } catch (err) {
         winston.error(`the ${TJBot.SERVICES.LANGUAGE_TRANSLATOR} service returned an error`, err);
         throw err;
 
     }
 
 
 
 /*
     return new Promise(function(resolve, reject) {
         if (self._translations == undefined) {
             self._languageTranslator.getModels({}, function(err, models) {
                 var translations = {};
                 if (err) {
                     winston.error("unable to retrieve list of language models for translation", err);
                     reject(err);
                 } else {
                     if (models.hasOwnProperty('models')) {
                         models.models.forEach((model) => {
                             if (translations[model.source] == undefined) {
                                 translations[model.source] = [];
                             }
                             if (!translations[model.source].includes(model.target)) {
                                 translations[model.source].push(model.target);
                             }
                         });
                     } else {
                         winston.error("unexpected result received for list of language models for translation");
                         reject(err);
                     }
                 }
                 resolve(translations);
             });
         } else {
             resolve(translations);
         }
     });
     */
 }
 
 
 
 
 /**
  * Determines if TJBot can translate from the source language to the target language.
  * Assumes that the language model list has been loaded.
  *
  * @param {String} sourceLanguage The source language (e.g. "en" for English)
  * @param {String} targetLanguage The target language (e.g. "es" for Spanish)
  *
  * Returns true if the sourceLanguage can be translated to the targetLanguage.
  */
 TJBot.prototype._isTranslatable = function(sourceLanguage, targetLanguage) {
     if (this._translations[sourceLanguage] != undefined) {
         return this._translations[sourceLanguage].includes(targetLanguage);
     }
 
     return false;
 }
 
 /** ------------------------------------------------------------------------ */
 /** WAVE                                                                     */
 /** ------------------------------------------------------------------------ */
 
 TJBot.prototype._SERVO_ARM_BACK = 500;
 TJBot.prototype._SERVO_ARM_UP = 1400;
 TJBot.prototype._SERVO_ARM_DOWN = 2300;
 
 /**
  * Move TJ's arm all the way back.
  */
 TJBot.prototype.armBack = function() {
     // make sure we have an arm
     this._assertCapability('wave');
     this._motor.servoWrite(TJBot.prototype._SERVO_ARM_BACK);
 }
 
 /**
  * Raise TJ's arm.
  */
 TJBot.prototype.raiseArm = function() {
     // make sure we have an arm
     this._assertCapability('wave');
     this._motor.servoWrite(TJBot.prototype._SERVO_ARM_UP);
 }
 
 /**
  * Lower TJ's arm.
  */
 TJBot.prototype.lowerArm = function() {
     // make sure we have an arm
     this._assertCapability('wave');
     this._motor.servoWrite(TJBot.prototype._SERVO_ARM_DOWN);
 }
 
 /**
  * Wave TJ's arm.
  */
 TJBot.prototype.wave = function() {
     this._assertCapability('wave');
 
     var delay = 200;
 
     this._motor.servoWrite(TJBot.prototype._SERVO_ARM_UP);
     this.sleep(delay);
 
     this._motor.servoWrite(TJBot.prototype._SERVO_ARM_DOWN);
     this.sleep(delay);
 
     this._motor.servoWrite(TJBot.prototype._SERVO_ARM_UP);
     this.sleep(delay);
 
     return true;
 }
 
 /** ------------------------------------------------------------------------ */
 /** MODULE EXPORTS                                                           */
 /** ------------------------------------------------------------------------ */
 
 /**
  * Export TJBot!
  */
 module.exports = TJBot;
 
