# AI Post-Recovery Platform MVP

To Check the Prototype Do the Following Steps 

* .zip out his repo * 
-and export it in your pc

## Run this in your command prompt 

```bash
cd your path of the folder
```

Then 

## Run this install

```bash
npm install
```

Then 

## Run Tests

```bash
npm run dev:web
```

Now run the local host in your chrome (make sure you run this in chrome only because the voice assistant is not working properly on other browsers) 
Allow chrome for using microphone to test (in most of the cases the permission is asked and mic start working after you press start check in

## Important Notes

- Persistent demo state is stored in `data/app-store.json`.
- The code is structured so PostgreSQL, object storage, OCR vendors, push providers, and LLM providers can be swapped in later.
- Voice processing is modeled as a hybrid on-device/cloud workflow, but device-native wake/listen code is scaffolded. 
- AI guidance is grounded to approved recovery plans, uploaded documents, and curated rules. The assistant avoids diagnosis and escalates risky cases.
