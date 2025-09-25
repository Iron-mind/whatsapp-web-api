@echo off

:: Abrir el primer script en una nueva consola
start cmd /k "cd /d C:\Users\Usuario\Desktop\reps\justopago\whatsapp-web-api && npm run start"

start cmd /k "cd /d C:\Users\Usuario\Desktop\reps\ngrok &&  ngrok http --url=previously-stirring-egret.ngrok-free.app 6900"

pause
