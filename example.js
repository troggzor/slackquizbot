var QuizBot = require('slackquizbot');
var sleep = require('system-sleep');

var start = function () {
    try {
        var bot = new QuizBot('SLACK_TOKEN');
        setTimeout(function () { bot.startQuiz(null, 'CHANNEL_ID', 'QUIZ_ID'); }, 2000);
    } catch (ex) {
        console.log('\nCrashed:' + ex + '\n');
        console.log('Sleeping for 5 seconds...');
        sleep(5000);
        console.log('Trying to reconnect')
        start();
    }
}

start();