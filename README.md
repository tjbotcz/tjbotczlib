# Library for TJBotCZ
TJBotCZ uses its own library that is already registered in npm. It builds on original TJBot library.

### Why we came with new library?
1. TJBotCZ uses different LED (simple classical RGB LED) that does not conflict with jack audio output (problem with original NEOPIXEL LED used). The RGB LED can shine (TJBotCZ_lite version) or even pulse (TJBotCZ version). (Note: The library support for original NEOPIXEL LED still remains.)
2. When using Watson Assisstant service we manage the context object that is being sent to the service.
3. Listen function - we support possibility to train your own model of recognizing english words.
4. We have face detection functionality of Visual Recognition service implemented (TJBotCZ version).
5. We support both custom and built-in classifier IDs (so you can train your own model for visual recognition).
6. We transfer the TTS in MP3 format (instead of wav) which reults in better response times of Text To Speech service.
7. We use narrowBandModel with 16000 sampling rate for the mic which results in better response times of Speech To text service.
