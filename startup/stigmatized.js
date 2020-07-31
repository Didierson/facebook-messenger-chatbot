/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 */

'use strict';

// Messenger API integration example
// We assume you have:
// * a Wit.ai bot setup (https://wit.ai/docs/quickstart)
// * a Messenger Platform setup (https://developers.facebook.com/docs/messenger-platform/quickstart)
// You need to `npm install` the following dependencies: body-parser, express, node-fetch.
//
// 1. npm install body-parser express node-fetch
// 2. Download and install ngrok from https://ngrok.com/download
// 3. ./ngrok http 8445
// 4. WIT_TOKEN=your_access_token FB_APP_SECRET=your_app_secret FB_PAGE_TOKEN=your_page_token node examples/messenger.js
// 5. Subscribe your page to the Webhooks using verify_token and `https://<your_ngrok_io>/webhook` as callback URL.
// 6. Talk to your bot on Messenger!

const bodyParser = require('body-parser');
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');

let Wit = null;
let log = null;
try {
  // if running from repo
  Wit = require('../').Wit;
  log = require('../').log;
} catch (e) {
  Wit = require('node-wit').Wit;
  log = require('node-wit').log;
}

module.exports = {
  Logger: require('../lib/logger.js').Logger,
  logLevels: require('../lib/logger.js').logLevels,
  Wit: require('../lib/wit.js').Wit,
}

// Webserver parameter
const PORT = process.env.PORT || 5000;

// Wit.ai parameters
const WIT_TOKEN = process.env.WIT_TOKEN;

const GRAPH_URL = "https://graph.facebook.com/";

// Messenger API parameters
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
if (!FB_PAGE_TOKEN) { throw new Error('missing FB_PAGE_TOKEN') }
const FB_APP_SECRET = process.env.FB_APP_SECRET;
if (!FB_APP_SECRET) { throw new Error('missing FB_APP_SECRET') }

let FB_VERIFY_TOKEN = null;
crypto.randomBytes(8, (err, buff) => {
  if (err) throw err;
  FB_VERIFY_TOKEN = buff.toString('hex');
  console.log(`/webhook will accept the Verify Token "${FB_VERIFY_TOKEN}"`);
});


// ----------------------------------------------------------------------------
// Messenger API specific code

// See the Send API reference
// https://developers.facebook.com/docs/messenger-platform/send-api-reference

const fbMessage = (id, text) => {
  const body = JSON.stringify({
    recipient: { id },
    message: { text },
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

const whenMessage = (id) => {
  const body = JSON.stringify({
    recipient: { id },
    "messaging_type": "RESPONSE",
    "message": {
      "text": "When did this occur:",
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Today",
          "payload":"payload_1"
        },{
          "content_type":"text",
          "title":"Yesterday",
          "payload":"payload_2"
        },{
          "content_type":"text",
          "title":"Last Week",
          "payload":"payload_2"
        },{
          "content_type":"text",
          "title":"Last Month",
          "payload":"payload_2"
        },{
          "content_type":"text",
          "title":"More than 3 months",
          "payload":"payload_2"
        },{
          "content_type":"text",
          "title":"More than 6 months",
          "payload":"payload_2"
        },{
          "content_type":"text",
          "title":"More than a year",
          "payload":"payload_2"
        }
      ]
    }
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });

};

const sendAdvice = (id) => {
  const body = JSON.stringify({
    recipient: { id },
    "messaging_type": "RESPONSE",
    "message": {
      "text": "I want to make it clear to you that it is not your fault that this happened. Therefore you don't have any reason to blame yourself. \n1. They choose to rapists, you are the victim not the guilty. \n2. There are no surefire way to identify a rapist. Sometimes they are completely normal, nice, charming and non-threatening. \n3. Rape is a crime of opportunity. Studies show that rapists choose victims based on their vulnerability, not on how sexy they appear or how flirtatious they are.\n4. Date rapists often defend themselves by claiming the assault was a drunken mistake or miscommunication. But research shows that the vast majority of date rapists are repeat offenders. These men target vulnerable people and often ply them with alcohol in order to rape them. \n5. Just because you’ve previously consented to sex with someone doesn’t give them perpetual rights to your body. If your spouse, boyfriend, or lover forces sex against your will, it’s rape. \nOpening up can be a good step towards healing. \n\nCan you tell me how it happened?",
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Yeah",
          "payload":"Positive"
        },{
          "content_type":"text",
          "title":"Nah",
          "payload":"Negative"
        }
      ]
    }
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

// ----------------------------------------------------------------------------
// Wit.ai bot specific code

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = (fbid) => {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === fbid) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: fbid, context: {}};
  }
  return sessionId;
};

// Setting up our bot
const wit = new Wit({
  accessToken: WIT_TOKEN,
  logger: new log.Logger(log.INFO)
});

// Starting our webserver and putting it all together
const app = express();
app.use(({method, url}, rsp, next) => {
  rsp.on('finish', () => {
    console.log(`${rsp.statusCode} ${method} ${url}`);
  });
  next();
});
app.use(bodyParser.json({ verify: verifyRequestSignature }));

// Webhook setup
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === FB_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(400);
  }
});

// Message handler
app.post('/webhook', (req, res) => {
  // Parse the Messenger payload
  // See the Webhook reference
  // https://developers.facebook.com/docs/messenger-platform/webhook-reference
  const data = req.body;

  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message && !event.message.is_echo) {
          // Yay! We got a new message!
          // We retrieve the Facebook user ID of the sender
          const sender = event.sender.id;

          // We could retrieve the user's current session, or create one if it doesn't exist
          // This is useful if we want our bot to figure out the conversation history
          // const sessionId = findOrCreateSession(sender);

          // We retrieve the message content
          const {text, attachments} = event.message;

          if (attachments) {
            // We received an attachment
            // Let's reply with an automatic message
            // Can only process text messages
            fbMessage(sender, 'Thank you for always keeping in touch but I do not understand.')
            .catch(console.error);
          } else if (text) {
            // We received a text message
            // Let's run /message on the text to extract some entities, intents and traits
            
            wit.message(text).then(({entities, intents, traits}) => {
              // You can customize your response using these
              console.log(intents);
              console.log(entities);
              console.log(traits);

              const responses = {
                greetings: ["Hey", "Hello", "Hi there!"],

                thanks: ["You are welcome", "Welcome", "Glad I could help"],

                byes: ["Bye bye", "Goodbye", "Bye"],

              };

              const firstValue = (obj, key) => {
                const val = obj && obj[key] &&
                  Array.isArray(obj[key]) &&
                  obj[key].length > 0 &&
                  obj[key][0].value
                ;
                if (!val) {
                  return null;
                }
                return val;
              };

              const greetings = firstValue(traits, 'wit$greetings');
              const getStarted = firstValue(traits, 'wit_started');
              const introducing = firstValue(entities, 'wit$contact:contact');
              const getDate = firstValue(entities, 'wit$datetime:datetime');
              const getStory = firstValue(entities, 'wit$agenda_entry:agenda_entry');
              const thanks = firstValue(traits, 'wit$thanks');
              const byes = firstValue(traits, 'wit$bye');
              const healthstatus = firstValue(traits, 'wit_healthstatus');
              const attacked = firstValue(traits, 'wit_attacked');
              // For now, let's reply with another automatic message
              if(greetings){
                  helloPostback(sender);
              }else if(text == 'Yeah'){
                fbMessage(sender, `Please go on. I'm here for you`);
              }else if(text == 'Not now'  || text == 'Maybe Later'  || text == 'Lets take a break'){
                fbMessage(sender, `Alright, just type 'step' when you are ready`);
              }else if(text == 'Yeah, Sure' ||text == 'Yeah Sure' || text == 'step'|| text == 'ok'|| text == 'sure'  || text == 'Nah'){
                recommendStepOne(sender);
              }else if(text == 'Go on'){
                recommendStepTwo(sender);
              }else if(text == 'Keep Going'){
                recommendStepThree(sender);
              }else if(text == 'Next Step'){
                recommendStepFour(sender);
              }else if(text == 'Definitely'){
                recommendFinalStep(sender);
              }else if(text == 'I reported' || text == 'I did Not'){
                fbMessage(sender, `It may too much to ask but reporting a rape case to appropriate authorities is your civic responsibility and you may be saving another victim and at the same time making sure the guilty does not go free which will also deter future offenders.`);
              }else if(text == 'No' || text == 'no'){
                fbMessage(sender, `Rape is a very serious act which is a danger to human existence. Perhaps I can help you recommend ways to help someone who has experienced such an act.`);
              }else if(text === 'Yes, long ago' || text === 'Yes, recently'|| getStarted){
                whenMessage(sender);
              }else if(getDate || text == 'More than 6 months'){
                sendAdvice(sender);
              }else if(getStory){
                recommendStep(sender);
              }else if(thanks){
                fbMessage(sender, responses.thanks[
                  Math.floor(Math.random() * responses.thanks.length)
                  ]);
              }else if(byes){
                fbMessage(sender, responses.byes[
                  Math.floor(Math.random() * responses.byes.length)
                  ]);
              }else{
                fbMessage(sender, `This is embarrassing but I cannot understand your text: ${text}.`);
              }
            })
            .catch((err) => {
              console.error('Oops! Got an error from Wit: ', err.stack || err);
            })
          }
        }else if (event.postback) {
          const sender = event.sender.id;
          const payload = event.postback.payload;

          if (payload === "Greeting") {
            getStartedPostback(sender);
          }
        } else {
            console.log('received event', JSON.stringify(event));
        }
      });
    });
  }
  res.sendStatus(200);
  });

  const responses = {
   feelings: ["I can't say I understand all you're going through but I am here to help. \n\nWould you like me to recommend steps to help you recover from such trauma", "I know it must be really difficult right now but all hope is not lost. \n\nI can help you with steps to get better, Would you want that?", "This must be very difficult but believe me when I say all hope is not lost. \n\nAllow me to recommend steps to help you with this experience."],

   step_one: ["*Open up about what happened to you\n\nIt can be extraordinarily difficult to admit that you were raped or sexually assaulted. There’s a stigma attached. It can make you feel dirty and weak. You may also be afraid of how others will react. Will they judge you? Look at you differently? It seems easier to downplay what happened or keep it a secret. But when you stay silent, you deny yourself help and reinforce your victimhood. \n\nReach out to someone you trust. It’s common to think that if you don’t talk about your rape, it didn’t really happen. But you can’t heal when you’re avoiding the truth. And hiding only adds to feelings of shame. As scary as it is to open up, it will set you free. However, it’s important to be selective about who you tell, especially at first. Your best bet is someone who will be supportive, empathetic, and calm. If you don’t have someone you trust, talk to a therapist or call a rape crisis hotline. \n\nChallenge your sense of helplessness and isolation. Trauma leaves you feeling powerless and vulnerable. It’s important to remind yourself that you have strengths and coping skills that can get you through tough times. One of the best ways to reclaim your sense of power is by helping others: volunteer your time, give blood, reach out to a friend in need, or donate to your favorite charity. \n\nConsider joining a support group for other rape or sexual abuse survivors. Support groups can help you feel less isolated and alone. They also provide invaluable information on how to cope with symptoms and work towards recovery. If you can’t find a support group in your area, look for an online group. \n\n Would you want me to continue"],

   step_two: ["*Cope with feelings of guilt and shame \n\nEven if you intellectually understand that you’re not to blame for the rape or sexual attack, you may still struggle with a sense of guilt or shame. These feelings can surface immediately following the assault or arise years after the attack. But as you acknowledge the truth of what happened, it will be easier to fully accept that you are not responsible. You did not bring the assault on yourself and you have nothing to be ashamed about. \n\nFeelings of guilt and shame often stem from misconceptions such as:\n\nYou didn’t stop the assault from happening. After the fact, it’s easy to second guess what you did or didn’t do. But when you’re in the midst of an assault, your brain and body are in shock. You can’t think clearly. Many people say they feel “frozen.” Don’t judge yourself for this natural reaction to trauma. You did the best you could under extreme circumstances. If you could have stopped the assault, you would have.\n\nYou trusted someone you “shouldn’t” have. One of the most difficult things to deal with following an assault by someone you know is the violation of trust. It’s natural to start questioning yourself and wondering if you missed warning signs. Just remember that your attacker is the only one to blame. Don’t beat yourself up for assuming that your attacker was a decent human being. Your attacker is the one who should feel guilty and ashamed, not you.\n\nYou were drunk or not cautious enough. Regardless of the circumstances, the only one who is responsible for the assault is the perpetrator. You did not ask for it or deserve what happened to you. Assign responsibility where it belongs: on the rapist. \n\nI'm sure this is large. I can continue if you want that"],

   step_three: ["*Prepare for flashbacks and upsetting memories\n\nWhen you go through something stressful, your body temporarily goes into “fight-or-flight” mode. You’re hyper sensitive to the smallest of stimuli. This is the case for many rape survivors. Flashbacks, nightmares, and intrusive memories are extremely common, especially in the first few months following the assault. If your nervous system remains “stuck” in the long-term and you develop post-traumatic stress disorder (PTSD), they can last much longer.\n\nTo reduce the stress of flashbacks and upsetting memories:\n\nTry to anticipate and prepare for triggers. Common triggers include anniversary dates; people or places associated with the rape; and certain sights, sounds, or smells. \n\nPay attention to your body’s danger signals. Your body and emotions give you clues when you’re starting to feel stressed and unsafe. \n\nTake immediate steps to self-soothe. When you notice any of the above symptoms, it’s important to quickly act to calm yourself down before they spiral out of control. One of the quickest and most effective ways to calm anxiety and panic is to slow down your breathing.\n\nTips for dealing with flashbacks\n\nIt’s not always possible to prevent flashbacks. But if you find yourself losing touch with the present and feeling like the sexual assault is happening all over again, there are actions you can take.\n\nAccept and reassure yourself that this is a flashback, not reality. The traumatic event is over and you survived. Here’s a simple script that can help: “I am feeling [panicked, frightened, overwhelmed, etc.] because I am remembering the rape/sexual assault, but as I look around I can see that the assault isn’t happening right now and I’m not actually in danger.”\n\nCan we go to the next one?"],

   step_four: ["*Reconnect to your body and feelings\n\nSince your nervous system is in a hypersensitive state following a rape or assault, you may start trying to numb yourself or avoid any associations with the trauma. But you can’t selectively numb your feelings. When you shut down the unpleasant sensations, you also shut down your self-awareness and capacity for joy. You end up disconnected both emotionally and physically—existing, but not fully living.\n\nSigns that you’re avoiding and numbing in unhelpful ways:\n\nFeeling physically shut down. You don’t feel bodily sensations like you used to (you might even have trouble differentiating between pleasure and pain).\n\nFeeling separate from your body or surroundings (you may feel like you’re watching yourself or the situation you’re in, rather than participating in it).\n\nHaving trouble concentrating and remembering things.\n\nUsing stimulants, risky activities, or physical pain to feel alive and counteract the empty feeling inside of you.\n\nCompulsively using drugs or alcohol.\n\nEscaping through fantasies, daydreams, or excessive TV, video games, etc.\n\nFeeling detached from the world, the people in your life, and the activities you used to enjoy.\n\nTo recover after rape, you need to reconnect to your body and feelings.\n\nIt’s frightening to get back in touch with your body and feelings following a sexual trauma. In many ways, rape makes your body the enemy, something that’s been violated and contaminated—something you may hate or want to ignore. It’s also scary to face the intense feelings associated with the assault. But while the process of reconnecting may feel threatening, it’s not actually dangerous. Feelings, while powerful, are not reality. They won’t hurt you or drive you insane. The true danger to your physical and mental health comes from avoiding them.\n\nOnce you’re back in touch with your body and feelings, you will feel more safe, confident, and powerful.\n\nThis is the last step, I bet you want to hear it all"],

   final_step: ["*Stay connected\n\nIt’s common to feel isolated and disconnected from others following a sexual assault. You may feel tempted to withdraw from social activities and your loved ones. But it’s important to stay connected to life and the people who care about you. Support from other people is vital to your recovery. But remember that support doesn’t mean that you always have to talk about or dwell on what happened. Having fun and laughing with people who care about you can be equally healing.\n\nParticipate in social activities, even if you don’t feel like it. \n\nMake new friends. If you live alone or far from family and friends, try to reach out and make new friends. \n\n\n\nNurture yourself\n\nHealing from sexual trauma is a gradual, ongoing process. It doesn’t happen overnight, nor do the memories of the trauma ever disappear completely. This can make life seem difficult at times. But there are many steps you can take to cope with the residual symptoms and reduce your anxiety and fear.\n\nTake time to rest and restore your body’s balance. That means taking a break when you’re tired and avoiding the temptation to lose yourself by throwing yourself into activities. Avoid doing anything compulsively, including working. \n\nBe smart about media consumption. Avoid watching any program that could trigger bad memories or flashbacks. This includes obvious things such as news reports about sexual violence and sexually explicit TV shows and movies.\n\nAvoid alcohol and drugs. \n\nTake care of yourself physically. It’s always important to eat right, exercise regularly, and get plenty of sleep. Exercise in particular can soothe your traumatized nervous system, relieve stress, and help you feel more powerful and in control of your body.\n\nDid you report this to the police"],

  };

const recommendStep = (id) => {
  const body = JSON.stringify({
    recipient: { id },
    "messaging_type": "RESPONSE",
    "message": {
      "text": responses.feelings[
                  Math.floor(Math.random() * responses.feelings.length)
                  ],
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Yeah, Sure",
          "payload":"SURE"
        },{
          "content_type":"text",
          "title":"Maybe Later",
          "payload":"Not now"
        }
      ]
    }
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

const recommendStepOne = (id) => {
  const body = JSON.stringify({
    recipient: { id },
    "messaging_type": "RESPONSE",
    "message": {
      "text": responses.step_one[0],
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Go on",
          "payload":"SURE"
        },{
          "content_type":"text",
          "title":"Maybe Later",
          "payload":"GOOD"
        }
      ]
    }
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

const recommendStepTwo = (id) => {
  const body = JSON.stringify({
    recipient: { id },
    "messaging_type": "RESPONSE",
    "message": {
      "text": responses.step_two[0],
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Keep Going",
          "payload":"SURE"
        },{
          "content_type":"text",
          "title":"Lets take a break",
          "payload":"GOOD"
        }
      ]
    }
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

const recommendStepThree = (id) => {
  const body = JSON.stringify({
    recipient: { id },
    "messaging_type": "RESPONSE",
    "message": {
      "text": responses.step_three[0],
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Definitely",
          "payload":"SURE"
        },{
          "content_type":"text",
          "title":"Not now",
          "payload":"GOOD"
        }
      ]
    }
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

const recommendStepFour = (id) => {
  const body = JSON.stringify({
    recipient: { id },
    "messaging_type": "RESPONSE",
    "message": {
      "text": responses.step_three[0],
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Next Step",
          "payload":"SURE"
        },{
          "content_type":"text",
          "title":"Not now",
          "payload":"GOOD"
        }
      ]
    }
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

const recommendFinalStep = (id) => {
  const body = JSON.stringify({
    recipient: { id },
    "messaging_type": "RESPONSE",
    "message": {
      "text": responses.final_step[0],
      "quick_replies":[
        {
          "content_type":"text",
          "title":"I reported",
          "payload":"Yes I did"
        },{
          "content_type":"text",
          "title":"I did not",
          "payload":"Not now"
        }
      ]
    }
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};

const helloPostback = (sender_psid) => {
  console.log(sender_psid);
  return fetch(`${GRAPH_URL}${sender_psid}?fields=first_name&access_token=${FB_PAGE_TOKEN}`)
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    console.log(json.first_name);
    const responses = {
      greetings: ["Hey ", "Hello ", "Hi "],
    };
    var name = json.first_name;
    var greeting = responses.greetings[
                  Math.floor(Math.random() * responses.greetings.length)
                  ] + name + '!';
    fbMessage(sender_psid, greeting);
    return json;
  });
};

const getStartedPostback = (sender_psid) => {
  console.log(sender_psid);
  return fetch(`${GRAPH_URL}${sender_psid}?fields=first_name&access_token=${FB_PAGE_TOKEN}`)
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    console.log(json.first_name);
    var name = json.first_name;
    var greeting = "Hi " + name + '!';
    getStartedReply(sender_psid, greeting);
    return json;
  });
};

const getStartedReply = (id, greeting) => {
  const body = JSON.stringify({
    recipient: { id },
    "messaging_type": "RESPONSE",
    "message": { 
      "text": greeting + "\n\nWelcome to Stigmatized. \n\nI am Chloe, here to offer any help I can, to you or any other person who has been involved in any form of sexual assault, and hey!, it's just between you and I. \n\nHave you ever experienced any form of sexual assault before? ",
      "quick_replies":[
        {
          "content_type":"text",
          "title":"Yes, recently",
          "payload":"YES"
        },{
          "content_type":"text",
          "title":"Yes, long ago",
          "payload":"YES"
        },{
          "content_type":"text",
          "title":"No",
          "payload":"NO"
        }
      ]
    }
  });
  const qs = 'access_token=' + encodeURIComponent(FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};


/*
 * Verify that the callback came from Facebook. Using the App Secret from
 * the App Dashboard, we can verify the signature that is sent with each
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];
  console.log(signature);

  if (!signature) {
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', FB_APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

app.listen(PORT);
console.log('Listening on :' + PORT + '...');
