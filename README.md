# Library for TJBotCZ
TJBotCZ uses its own library that is already registered in npm.

### Why we came with new library?
1. TJBotCZ uses different LED (simple classical RGB LED) that does not conflict with jack audio output (problem with original NEOPIXEL LED used). The RGB LED can shine (TJBotCZ_lite version) or even pulse (TJBotCZ version).
2. In using Watson Assisstant service we manage the context object that is being sent to the service.
3. Listen function - we support possibility to train your own model of recognizing english words.
4. We have face detection functionality of Visual Recognition service implemented.
