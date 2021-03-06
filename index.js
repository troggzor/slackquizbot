var fs = require('fs');
var SlackAPI = require('slackbotapi');
var Quiz = require('./quiz.js');
var NodeCache = require('node-cache');

function QuizBot(slackToken, locale) {
	if (typeof locale === 'undefined') { locale = 'en'; }

	this.slack = new SlackAPI({
		'token': slackToken,
		'logging': false
	});

	this.slack.on('hello', this.onConnectToSlack.bind(this));
	this.slack.on('message', this.onSlackMessage.bind(this));
	this.slack.on('file_shared', this.onFileShared.bind(this));

	this.quizzes = [];
	this.locale = locale;
	this.cache = new NodeCache();
}

QuizBot.prototype.loadLocale = function (lang) {
	var isLocalSuccess = this.tryLoadLocale('locale/' + lang + '.json');
	if (!isLocalSuccess) {
		var isBuiltInSuccess = this.tryLoadLocale(__dirname + '/locale/' + lang + '.json');
		if (!isBuiltInSuccess) {
			this.onLocaleLoadFailed(lang);
			return false;
		}
	}
	return true;
};

QuizBot.prototype.tryLoadLocale = function (filePath) {
	try {
		var data = fs.readFileSync(filePath, 'utf8');
		this.locale = JSON.parse(data);
		return true;
	} catch (e) {
		return false;
	}
};

QuizBot.prototype.getLocale = function (quiz, id) {
	if (quiz != null) {
		var customQuizLocale = quiz.getCustomLocale(id);
		if (customQuizLocale) {
			return customQuizLocale;
		}
	}

	if (this.locale[id] && this.locale[id].length > 0) {
		var rnd = Math.floor(Math.random() * this.locale[id].length);
		return this.locale[id][rnd];
	} else {
		return "Oops, I don't have locale for " + id;
	}
};

QuizBot.prototype.onLocaleLoadFailed = function (lang) {
	this.slack.sendMsg(slackChannel, this.getLocale(null, quizId.length == 0 ? 'quizLoadFailedEmpty' : 'quizLoadFailed').replace("<quizId>", quizId));// + " [" + err + "]");
};

QuizBot.prototype.saveQuizToDisk = function (name, url, slackChannel) {
	var quizId = name.replace(/\.[^/.]+$/, "");

	var http = require('https');

	var content = '';
	var request = http.request(url, function (res) {
		res.on('data', function (chunk) {
			content += chunk;
		}.bind(this));
		res.on('end', function () {
			try {
				fs.mkdirSync('data');
			} catch (e) { }
			fs.writeFile('data/' + quizId + '.json', content, function (err) {
				if (err) {
					this.slack.sendMsg(slackChannel, "Couldn't save file. Error: " + err);
					return;
				}
				this.slack.sendMsg(slackChannel, "Quiz successfully saved as " + quizId + '!');
			}.bind(this));
		}.bind(this));
	}.bind(this));
	request.on('error', function (e) {
		this.slack.sendMsg(slackChannel, "There was an error: " + e.message);
	}.bind(this));
	request.end();
};

QuizBot.prototype.listQuizzes = function (slackChannel) {
	this.quizList = [];
	fs.readdir(__dirname + '/data', function (err, files) {
		if (err) {
			//this.slack.sendMsg(slackChannel, "Couldn't find directory. Error: " + err);
			//return;
		} else {
			for (var i = 0; i < files.length; i++) {
				this.quizList.push(files[i].replace(/\.[^/.]+$/, ""));
			}
		}
		fs.readdir('data', function (err, files) {
			if (err) {
				//this.slack.sendMsg(slackChannel, "Couldn't find directory. Error: " + err);
				//return;
			} else {
				for (var i = 0; i < files.length; i++) {
					this.quizList.push(files[i].replace(/\.[^/.]+$/, ""));
				}
			}
			var output = "";
			for (var i = 0; i < this.quizList.length; i++) {
				if (i != 0) output += ", ";
				output += this.quizList[i];
			}
			this.slack.sendMsg(slackChannel, "Here are the quizzes I've got: " + output);
		}.bind(this));
	}.bind(this));
};

QuizBot.prototype.loadQuiz = function (slackChannel, quizId) {
	var isLocalSuccess = this.tryLoadQuiz('data\\' + quizId + '.json', slackChannel, quizId);
	if (!isLocalSuccess) {
		var isBuiltInSuccess = this.tryLoadQuiz(__dirname + '\\data\\' + quizId + '.json', slackChannel, quizId);
		if (!isBuiltInSuccess) {
			this.onQuizLoadFailed(slackChannel, quizId);
		}
	}

};

QuizBot.prototype.tryLoadQuiz = function (filePath, slackChannel, quizId) {
	try {
		var data = fs.readFileSync(filePath, 'utf8').trim('"');
		this.onQuizLoadSuccess(data, slackChannel);
		return true;
	} catch (e) {
		return false;
	}
};

QuizBot.prototype.onQuizLoadSuccess = function (data, slackChannel) {
	var quiz = new Quiz();
	quiz.on('questionPrep', this.onQuestionPrepped.bind(this));
	quiz.on('question', this.onQuestionStarted.bind(this));
	quiz.on('correctAnswer', this.onCorrectAnswer.bind(this));
	quiz.on('incorrectAnswer', this.onIncorrectAnswer.bind(this));
	quiz.on('questionTimeout', this.onQuestionTimeout.bind(this));
	quiz.on('questionSkip', this.onQuestionSkip.bind(this));
	quiz.on('otherPossibleAnswers', this.onOtherPossibleAnswers.bind(this));
	quiz.on('answerPrompt10SecondsLeft', this.onAnswerPrompt10SecondsLeft.bind(this));
	quiz.on('showScores', this.onShowScores.bind(this));
	quiz.on('quizComplete', this.onQuizComplete.bind(this));

	quiz.init(JSON.parse(data), slackChannel);
	this.quizzes[slackChannel] = quiz;

	quiz.start();
};

QuizBot.prototype.onQuizLoadFailed = function (slackChannel, quizId) {
	this.slack.sendMsg(slackChannel, this.getLocale(null, quizId.length == 0 ? 'quizLoadFailedEmpty' : 'quizLoadFailed').replace("<quizId>", quizId));// + " [" + err + "]");
};

QuizBot.prototype.startQuiz = function (quiz, slackChannel, quizId) {
	var isValid = true;
	if (quiz != null && quiz.state > 0) {
		isValid = false;
	}
	if (isValid) {
		this.loadQuiz(slackChannel, quizId);
	} else {
		this.slack.sendMsg(slackChannel, this.getLocale(quiz, 'quizAlreadyRunning'));
	}
};

QuizBot.prototype.pauseQuiz = function (quiz, slackChannel) {
	if (quiz == null) {
		this.slack.sendMsg(slackChannel, this.getLocale(quiz, 'quizNotLoadedYet'));
	} else {
		this.slack.sendMsg(slackChannel, this.getLocale(quiz, 'quizPaused'));
		quiz.pause();
	}
};

QuizBot.prototype.resumeQuiz = function (quiz, slackChannel) {
	if (quiz == null) {
		this.slack.sendMsg(slackChannel, this.getLocale(quiz, 'quizNotLoadedYet'));
	} else {
		this.slack.sendMsg(slackChannel, this.getLocale(quiz, 'quizResumed'));
		quiz.resume();
	}
};

QuizBot.prototype.stopQuiz = function (quiz, slackChannel) {
	if (quiz == null) {
		this.slack.sendMsg(slackChannel, this.getLocale(quiz, 'quizNotLoadedYet'));
	} else {
		this.slack.sendMsg(slackChannel, this.getLocale(quiz, 'quizStopped'));
		quiz.stop();
		this.quizzes[slackChannel] = null;
	}
};

QuizBot.prototype.onQuestionPrepped = function (quiz, questionIndex) {
	var text = this.getLocale(quiz, 'questionPrep');
	text = text.replace("<number>", questionIndex + 1);
	this.slack.sendMsg(quiz.slackChannel, text);
};

QuizBot.prototype.onQuestionStarted = function (quiz, question) {
	var pointsPrefix = "";
	var text;
	if (question.points > 1 || question.answerCount > 1) {
		pointsPrefix = "For " + question.points + " point" + (question.points != 1 ? "s" : "") + (question.answerCount > 1 ? " each" : "") + ", ";
		text = pointsPrefix + "*" + question.text.substring(0, 1).toLowerCase() + question.text.substring(1) + "* " + (question.image != null ? question.image : "");
	}
	else {
		text = "*" + question.text + "* " + (question.image != null ? question.image : "");

	}
	this.slack.sendMsg(quiz.slackChannel, text);
};

QuizBot.prototype.onQuestionTimeout = function (quiz, question) {
	this.slack.sendMsg(quiz.slackChannel, this.getLocale(quiz, 'questionTimeout') + ' ' + this.getCorrectAnswerText(quiz, question));
};

QuizBot.prototype.onQuestionSkip = function (quiz, question) {
	this.slack.sendMsg(quiz.slackChannel, this.getLocale(quiz, 'questionSkip') + ' ' + this.getCorrectAnswerText(quiz, question));
};

QuizBot.prototype.onOtherPossibleAnswers = function (quiz, otherAnswers) {
	var text = otherAnswers.length == 1 ? this.getLocale(quiz, 'otherPossibleAnswer') : this.getLocale(quiz, 'otherPossibleAnswers');
	var answersText = "";
	for (var i = 0; i < otherAnswers.length; i++) {
		if (i != 0) {
			if (i == otherAnswers.length - 1) {
				answersText += " and ";
			} else {
				answersText += ", ";
			}
		}
		answersText += "_*" + otherAnswers[i].text[0] + "*_";
	}
	text = text.replace("<answer>", answersText);
	this.slack.sendMsg(quiz.slackChannel, text);
};

QuizBot.prototype.onCorrectAnswer = function (quiz, user, answers, points, answersLeft) {
	var correctMsg = "";
	if (answers.length == 1) {
		correctMsg = this.getLocale(quiz, 'correctAnswer');
	} else if (answers.length == 2) {
		correctMsg = this.getLocale(quiz, 'correctAnswers2');
	} else {
		correctMsg = this.getLocale(quiz, 'correctAnswers');
	}
	correctMsg = correctMsg.replace('<user>', "<@" + user.name + ">");
	var answersText = "";
	for (var i = 0; i < answers.length; i++) {
		if (i != 0) {
			if (i == answers.length - 1) {
				answersText += " and ";
			} else {
				answersText += ", ";
			}
		}
		answersText += "_*" + answers[i] + "*_";
	}
	correctMsg = correctMsg.replace('<answer>', answersText);
	var answersRemainingText = "";
	if (answersLeft > 0) answersRemainingText = " *" + answersLeft + "* answer" + (answersLeft != 1 ? "s" : "") + " left...";
	var pointsText = points + " point" + (points != 1 ? "s" : "");
	correctMsg = correctMsg.replace('<points>', pointsText);
	this.slack.sendMsg(quiz.slackChannel, "" + correctMsg + " " + answersRemainingText);
};

QuizBot.prototype.onShowScores = function (quiz, slackChannel) {
	if (quiz == null) {
		this.slack.sendMsg(slackChannel, this.getLocale(quiz, 'quizNotLoadedYet'));
	} else {
		this.slack.sendMsg(quiz.slackChannel, this.getLocale(quiz, 'latestScores') + quiz.getScores(this.getLocale(quiz, 'leads')));
	}
};

QuizBot.prototype.onIncorrectAnswer = function (quiz, user) {
	//this.slack.sendMsg(quiz.slackChannel, this.getLocale(quiz, 'incorrectAnswer'));
};

QuizBot.prototype.onAnswerPrompt10SecondsLeft = function (quiz, secondsLeft) {
	this.slack.sendMsg(quiz.slackChannel, "Anyone? Only " + secondsLeft + " seconds left!");
};

QuizBot.prototype.onQuizComplete = function (quiz) {
	delete this.quizzes[quiz.slackChannel];
	this.slack.sendMsg(quiz.slackChannel, this.getLocale(quiz, 'finalScores') + quiz.getScores(this.getLocale(quiz, 'wins')));
	this.slack.sendMsg(quiz.slackChannel, this.getLocale(quiz, 'closer'));
};

QuizBot.prototype.getQuizByChannel = function (slackChannel) {
	return this.quizzes[slackChannel];
};

//************************
//	Slack handlers
//************************
QuizBot.prototype.onConnectToSlack = function (data) {
	this.name = this.slack.slackData.self.name;
	this.id = this.slack.slackData.self.id;

	if (this.loadLocale(this.locale)) {
		console.log("Quizbot [" + this.name + "] is up and running!");
		this.registerExitHandler();
	} else {
		console.log("Quizbot [" + this.name + "] could not load '" + this.locale + "' locale file");
	}
};

QuizBot.prototype.onSlackMessage = function (slackMsgData) {
	if (typeof slackMsgData.text == 'undefined') return;

	var quiz = this.getQuizByChannel(slackMsgData.channel);
	var user = this.slack.getUser(slackMsgData.user);

	var isAdmin = user !== null && user.name === 'bogdan.boiculese';

	//check for mention
	if (slackMsgData.text.indexOf('<@' + this.id + '>') > -1) {

		// Admin commands
		if (isAdmin) {
			var startQuizIndex = slackMsgData.text.indexOf('start');
			if (startQuizIndex > -1) {
				var rest = slackMsgData.text.substring(startQuizIndex + 6);
				var nextSpace = rest.indexOf(" ");
				var quizId = rest.substring(0, nextSpace > -1 ? nextSpace : rest.length);
				this.startQuiz(quiz, slackMsgData.channel, quizId);
			} else if (slackMsgData.text.match(/(pause)\b/ig)) {
				this.pauseQuiz(quiz, slackMsgData.channel);
			} else if (slackMsgData.text.match(/(resume)\b/ig)) {
				this.resumeQuiz(quiz, slackMsgData.channel);
			} else if (slackMsgData.text.match(/(stop)\b/ig)) {
				this.stopQuiz(quiz, slackMsgData.channel);
			} else if (slackMsgData.text.match(/(list)\b/ig)) {
				this.listQuizzes(slackMsgData.channel);
			}
		}

		// Public commands
		if (slackMsgData.text.match(/(scores)\b/ig)) {
			this.onShowScores(quiz, slackMsgData.channel);
		}

	} else {
		//listen for normal text
		if (quiz && quiz.isQuestionActive()) {
			if (slackMsgData.text.match(/(^skip$)\b/ig)) {
				if (quiz && quiz.isQuestionActive()) {
					quiz.markSkipped(user);
				}
			} else if (slackMsgData.text.match(/(^hint$)\b/ig)) {
				this.showHint(quiz, user);
			} else {
				quiz.checkAnswer(slackMsgData.text, user);
			}
		}
	}
};

QuizBot.prototype.onFileShared = function (data) {
	// note (bb): Disabled since it crashes randomly
	//this.saveQuizToDisk(data.file.title, data.file.url, data.file.ims[0]);
};

QuizBot.prototype.showHint = function (quiz, user) {
	if (quiz == null || quiz.currentQuestion == null) return;
	var key = quiz.slackChannel + '_' + user.id;
	if (this.cache.get(key) != null) {
		return;
	}

	var answer = quiz.currentQuestion.answers[0].text[0];
	var answerWithoutSpaces = answer.replace(/\s/g, '');
	var readableCharsLength = answerWithoutSpaces.length;
	var hintCharsLenght = Math.ceil(readableCharsLength * quiz.settings.hintCharactersPercent / 100);
	var visibleIndexes = [];
	while (visibleIndexes.length < hintCharsLenght) {
		var randomIndex = Math.floor(Math.random() * answer.length);
		if (visibleIndexes.indexOf(randomIndex) != -1) {
			continue;
		}
		visibleIndexes.push(randomIndex);
	}

	var answerArray = [...answer];
	for (var i = 0; i < answerArray.length; i++) {
		// Replace hidden indexes with '⁎' and keep whitespace
		if (visibleIndexes.indexOf(i) === -1 && /\s/.test(answerArray[i]) === false) {
			answerArray[i] = '⁎';
		}
	}

	var hint = answerArray.join('');
	var message = this.getLocale(quiz, 'questionHint')
		.replace('<hint>', hint)
		.replace('<length>', hint.length);

	this.slack.sendMsg(quiz.slackChannel, message);
	this.cache.set(key, true, quiz.settings.hintInterval);
};

QuizBot.prototype.registerExitHandler = function () {
	process.on('SIGINT', this.exitHandler.bind(this, { exit: true }));
	process.on('uncaughtException', this.exitHandler.bind(this, { exit: true }));
};

QuizBot.prototype.exitHandler = function (options, err) {
	if (err) {
		var message = err.stack || err;
		console.log(message);
		this.slack.sendPM("bogdan.boiculese", "Psst, i crashed..." + message);
	} else {
		Object.keys(this.quizzes).forEach(channel => {
			this.slack.sendMsg(channel, "Disconnected...");
			this.quizzes[channel].saveScores();
		});
	}

	// note: wait for notification to be sent
	setTimeout(function () {
		process.exit(99);
	}, 2000);
};

QuizBot.prototype.getCorrectAnswerText = function (quiz, question) {
	var correctAnswerText = question.answerCount == 1 ? this.getLocale(quiz, 'correctAnswerSingle') : this.getLocale(quiz, 'correctAnswerMultiple');
	return correctAnswerText.replace("<data>", quiz.getCorrectAnswers());
};

module.exports = QuizBot;