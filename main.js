var converter;

var config = {
  tableLink:
    "https://docs.google.com/spreadsheets/d/1UvH8jHZu3mLjZv-gJaMIZOXlwkOBm_pnZrCUsW9f1Mk/edit#gid=0?usp=sharing",
  preventPageChangeOnIncorrect: true,
  testMode: false,
  insertPre: true,
  request: "select A,B,C,D,E,F,G,H Where C != 'Question' AND C = 'C2Q23'",
  recordsCount: 50,
  excludeUnfilledQuestions: true,
  limitRecordsAfterShuffling: true,
  timePerQuestion: (90 * 60) / 50,
  initialization: true,
  allowSkipEntireTest: true,
  pageNavigation: false,
  useHotkeys: true,
  answersRandomOrder: true,
  questionsRandomOrder: true
};

$(function () {
  init();

  if (config.initialization) {
    requestTable(
      "select A, B, count(C) where (C != '' AND A != 'Book')" + (config.excludeUnfilledQuestions ? addEmptyQuestionExclusionCondition() : "") + " group by A, B order by A, B",
      function (response) {
        const survey = new Survey.Model(combineSetupSurvey(response.html));

        $("#surveyContainer").Survey({
          model: survey,
          onComplete: (data) => {
            fulfilSetupConfig(data.data, config);
            requestTable(config.request, function (response) {
              makeQuiz(response.html);
            });
          }
        });
      },
      "setup-template",
      true
    );
  } else {
    requestTable(config.request + (config.excludeUnfilledQuestions ? addEmptyQuestionExclusionCondition() : ""), function (response) {
      makeQuiz(response.html);
    });
  }
});

function init() {
  Survey.StylesManager.applyTheme("modern");
  
  converter = new showdown.Converter();
  Handlebars.registerHelper("escapeJson", function (string) {
    return escapeString(string);
  });
  Handlebars.registerHelper("variants", function (string) {
    return splitVariants(string);
  });
  Handlebars.registerHelper("correctAnswers", function (ans, vars) {
    return getFullCorrectAnswers(ans, vars);
  });
}

function requestTable(filter, callback, templateId, allRecords = false) {
  $("#questions").sheetrock({
    url: config.tableLink,
    fetchSize:
      config.limitRecordsAfterShuffling || allRecords
        ? undefined
        : config.recordsCount || 0  - 1,
    query: filter,
    rowTemplate: template(templateId || "template"),
    callback: function (error, options, response) {
      if (error == null) {
        callback(response);
      } else {
        console.error(error);
      }
    }
  });
}

function makeQuiz(html) {
  const json = transformQuestions(html);
  const survey = new Survey.Model(json);
  survey.focusFirstQuestionAutomatic = false;

  if (config.pageNavigation) {
    survey.ignoreValidation = true;
  }

  if (config.allowSkipEntireTest) {
    survey.addNavigationItem({
      id: "survey_end_test",
      title: "Stop testing",
      visibleIndex: 49, // "Complete" button has the visibleIndex 50.
      action: () => {
        config.preventPageChangeOnIncorrect = false;
        survey.currentPage.elements[0].isRequired = false;
        survey.completeLastPage();
      }
    });
  }

  $("#surveyContainer").Survey({
    model: survey,
    focusOnFirstError: false,
    onCompleting: onCompleting,
    onComplete: printResult,
    onCurrentPageChanging: onCurrentPageChanging,
    onAfterRenderPage: () => window.scrollTo(0,0),
    onTextMarkdown: onTextMarkdown,
    onAfterRenderSurvey: () => mapHotkeys(survey)
  });
}

function formatDate(currentDate) {
  const date = currentDate.getDate();
  const month = currentDate.getMonth() + 1; // January is 0
  const year = currentDate.getFullYear();

  return `${date.toString().padStart(2, '0')}.${month.toString().padStart(2, '0')}.${year}`;
}

function printResult(survey, options) {
  var answers = survey.data;
  var allQuestions = survey.getAllQuestions().filter(q => q.name != 'reasoning');
  var answeredQuestions = survey.getQuestionsByNames(Object.keys(answers));
  var resultsByQuestion = allQuestions.map(q => ({
      question: q.name,
      answer: answers[q.name],
      isSkipped: !answers.hasOwnProperty(q.name),
      correctAnswer: q.correctAnswer,
      isAnswerCorrect: q.isAnswerCorrect(),
      wasMistakes: +(q.hasOwnProperty('wasMistakes') ? q.wasMistakes : !q.isAnswerCorrect()),
      date: formatDate(new Date())
    }));
  calculateAndSaveResults(survey, resultsByQuestion);
  var tableWithResult = resultsByQuestion.filter(q => !q.isSkipped).map(r => `${r.question}\t${r.wasMistakes}\t${r.answer}\t${r.date}`).join('\n');
  copyToClipboard(tableWithResult);
  console.log(tableWithResult);
}

function calculateAndSaveResults(survey, resultsByQuestion) {
  const answersWithoutMistake = resultsByQuestion.filter(q=> !q.wasMistakes).length;
  const skippedQuestions = resultsByQuestion.filter(q=> q.isSkipped).length;
  const answeredQuestions = resultsByQuestion.length - skippedQuestions;
  const testScore = Math.round(100 * (answersWithoutMistake / resultsByQuestion.length));

  survey.setValue("answersWithoutMistake", answersWithoutMistake);
  survey.setValue("skippedQuestions", skippedQuestions);
  survey.setValue("answeredQuestions", answeredQuestions);
  survey.setValue("testScore", testScore);
}

function copyToClipboard(text) {
  var dummy = document.createElement("textarea");
  document.body.appendChild(dummy);
  dummy.value = text;
  dummy.select();
  document.execCommand("copy");
  document.body.removeChild(dummy);
}

function mapHotkeys(survey) {
  hotkeys('1,2,3,4,5,6,7,8,9,0,a,b,c,d,e,f,g,h,space,enter,backspace', function (event, handler){
        var firstQuestionOnPage = survey.activePage.questions[0];
        var questionName = firstQuestionOnPage.getValueName();
        var choices = firstQuestionOnPage.getChoices().map(c => c.value);
        var currentValue = firstQuestionOnPage.getAllValues();
        if (/^[0-9a-hA-H]{1}$/.test(handler.key)) {
          toggleChoice(firstQuestionOnPage, currentValue, questionName, findChoice(choices, handler.key));
        } else if (/^space$|^enter$/.test(handler.key)) {
          if (survey.isLastPage) {         
            survey.completeLastPage(); 
          } else {        
            survey.nextPage();  
          }
        } else {
          survey.prevPage();
        }
      });
}

function findChoice(choices, index) {
  if (/^[0-9]{1}$/.test(index)) {
    return choices[index-1];
  } else if (/^[a-h]{1}$/.test(index)) {
    return choices.filter(c => c.trim().slice(0,1).toUpperCase() === index.toUpperCase())[0];
  }
}

function addEmptyQuestionExclusionCondition() {
  return " AND D != '' AND E != '' AND F != '' AND G != ''";
}

function addImgToTitleIfNeccesary(page) {
  if (!page || !page.elements || page.elements == 0 || !page.elements[0] || !page.elements[0].imageUrl) {
    return page;
  }
  
  var img = document.createElement("img");
    img.src = page.elements[0].imageUrl;
  page.elements[0].title = img.outerHTML + " " + page.elements[0].title;
  return page;
}

function toggleChoice(question, value, questionName, choice) {
  if (choice == undefined) {
    return;
  }
  if (!value.hasOwnProperty(questionName)) {
    value[questionName] = [];
  }
  if (~value[questionName].indexOf(choice)) {
    value[questionName] = value[questionName].filter(c => c !== choice);
  } else {
    value[questionName].push(choice);
  }
  question.setNewValue(value[questionName]);
}

function fulfilSetupConfig(setupData, config) {
  config.questionsRandomOrder = setupData.shuffle;
  config.answersRandomOrder = setupData.shuffleAnswers;
  if (setupData.testMode) {
    config.testMode = setupData.testMode;
    config.preventPageChangeOnIncorrect = false;
    config.answersRandomOrder = false;
    config.allowSkipEntireTest = false;
    config.pageNavigation = true;
  }
  config.recordsCount = setupData.questionCount;
  if (setupData.chapter !== "none") {
    config.request =
      "select A,B,C,D,E,F,G,H Where D != '' AND C != 'Question' AND B = '" +
      setupData.chapter +
      "'" + (config.excludeUnfilledQuestions ? addEmptyQuestionExclusionCondition() : "");
  } else if (setupData.explicitFilter && setupData.trim()) {
    config.request = "select A,B,C,D,E,F,G,H Where C != 'Question' AND " + setupData.explicitFilter;
  } else {
    config.request = "select A,B,C,D,E,F,G,H Where C != 'Question'" + (config.excludeUnfilledQuestions ? addEmptyQuestionExclusionCondition() : "");
  }
}

function combineSetupSurvey(html) {
  var choices = JSON.parse("[" + html.slice(0, -1) + "]");
  var jsonString =
    '{"showQuestionNumbers": "off","elements":[{"type":"boolean","name":"shuffle","defaultValue":'+config.questionsRandomOrder+',"title":"Shuffle questions?"},{"type":"boolean","name":"shuffleAnswers","defaultValue":'+config.answersRandomOrder+',"title":"Shuffle answers?"},{"type":"boolean","name":"testMode","defaultValue":'+config.testMode+',"title":"Test mode?"},{"type":"text","name":"questionCount","inputType":"number","title":"Questions count?","defaultValue":'+config.recordsCount+',"validators": [{ "type": "numeric", "text": "Value must be a number", "minValue":1, "maxValue": 231 }]},{"type": "dropdown","defaultValue":"none","name": "chapter","noneText":"all", "title": "Which chapter need to exam?","isRequired": true,"colCount": 0,"showNoneItem": true, "choices":' +
    JSON.stringify(choices) +
    '},{"type":"text","name":"explicitFilter","inputType":"text","title":"Explicit questions filter","defaultValue":""}]}';
  var json = JSON.parse(jsonString);
  return json;
}

function template(id) {
  return Handlebars.compile($("#" + id).html());
}

function transformQuestions(html) {
  var pages = JSON.parse("[" + html.slice(0, -1) + "]").map(p => addImgToTitleIfNeccesary(p));
  if (config.questionsRandomOrder) {
    pages = arrayShuffle(pages);
  }
  if (config.limitRecordsAfterShuffling) {
    pages = pages.slice(0, config.recordsCount);
  }
  if (config.pageNavigation) {
    for (let i = 0; i < pages.length; i++) {
      pages[i].navigationTitle = ""+(i+1);
      pages[i].navigationDescription = pages[i].elements[0].name;
    }
  }

  var jsonString =
    '{"title":"OCP Test","showQuestionNumbers": "off","progressBarType":"'+(config.pageNavigation?'buttons':'pages')+'","showProgressBar": "bottom","showTimerPanel": "top","maxTimeToFinish": ' +
    config.timePerQuestion * (config.recordsCount !== undefined ? Math.min(config.recordsCount, pages.length) : pages.length) +
    ', "completedHtml":"<h4>Test finished, but there is a trouble to determine results. Correct answers = {answersWithoutMistake}. Skipped = {skippedQuestions}. Score = {testScore}. Questions count = {questionCount}</h4>","completedHtmlOnCondition":[{"expression":"{answersWithoutMistake} == 0","html":"<h4>Unfortunately, none of your answers were correct. Please try again. Test result is copied to clipboard</h4>"},{"expression":"{answersWithoutMistake} != 0 && {skippedQuestions} == 0 && {testScore} < 68","html":"<h4>Unfortunately, you answered correctly <b>{answersWithoutMistake}</b> out of <b>{questionCount}</b> questions and didn\'t got the passing score (<b>{testScore}%</b>). Test result is copied to clipboard</h4>"},{"expression":"{answersWithoutMistake} != 0 && {skippedQuestions} > 0 && {testScore} < 68","html":"<h4>Unfortunately, you skipped <b>{skippedQuestions}</b> questions during the test, but answered correctly <b>{answersWithoutMistake}</b> out of <b>{answeredQuestions}</b> others and didn\'t got the passing score (<b>{testScore}%</b>). Test result is copied to clipboard</h4>"},{"expression":"{answersWithoutMistake} != 0 && {skippedQuestions} == 0 && {testScore} >= 68","html":"<h4>You answered correctly <b>{answersWithoutMistake}</b> out of <b>{questionCount}</b> questions and <b>passed!</b> (<b>{testScore}%</b>) Test result is copied to clipboard</h4>"},{"expression":"{answersWithoutMistake} != 0 && {skippedQuestions} > 0 && {testScore} >= 68","html":"<h4>You skipped <b>{skippedQuestions}</b> questions during the test, but answered correctly <b>{answersWithoutMistake}</b> out of <b>{answeredQuestions}</b> others and <b>passed!</b> (<b>{testScore}%</b>) Test result is copied to clipboard</h4>"},{"expression":"{answersWithoutMistake} == {questionCount}","html":"<h4>Congratulations! You answered all the questions correctly! Test result is copied to clipboard</h4>"}], "pages":' +
    JSON.stringify(pages) +
    "}";
  var json = JSON.parse(jsonString);
  return json;
}

function splitVariants(variants) {
  var splittedVars = variants
      .split(/([A-H]\.\s{0,1})/)
      .filter((s) => s || s.trim());
  var vars = [];
  for (var i = 0; i< splittedVars.length; i = i + 2) {
    vars.push({ value: splittedVars[i], text: config.insertPre ? addPre(splittedVars[i] + ' ' + splittedVars[i+1]) : splittedVars[i] + ' ' + splittedVars[i+1] });
  }
  if (config.answersRandomOrder) {
    vars = arrayShuffle(vars);
  }
  return JSON.stringify(vars);
}

function addPre(s) {
  return "<pre>" + s + "</pre>";
}
function delPre(s) {
  return s.slice(5, -6);
}

function getFullCorrectAnswers(answers, variants) {
  
  try {
    return JSON.stringify(
    answers
      .split(",")
      .map(
        (a) =>
          JSON.parse(variants).filter(
            (v) =>
              (config.insertPre ? delPre(v.text) : v.text)
                .trim()
                .slice(0, 1) === a.trim()
          )[0].value
      )
    );
  } catch (e) {
    console.error('There is an error to find answers ' + answers + ' among these variants ' + JSON.stringify(variants));
    console.error(e);
  }
}

function escapeString(json) {
  var escapable = /[;\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff<]/g;
  var meta = {
    // table of character substitutions
    "\b": "\\b",
    "\t": "&#9;",
    "\n": "<br>",
    "\f": "\\f",
    "\r": "\\r",
    '"': '&quot',
    ';': '&#59;',
    '<': '&lt;',
    "\\": "\\\\"
  };

  escapable.lastIndex = 0;
  return escapable.test(json)
    ? json.replace(escapable, function (a) {
        var c = meta[a];
        return typeof c === "string"
          ? c
          : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
      })
    : json;
}

function onCompleting(survey, option) {
  if (!config.preventPageChangeOnIncorrect) {
    return;
  }
  if (!survey.activePage.getFirstQuestionToFocus().isAnswerCorrect()) {
    option.allowComplete = false;
    survey.activePage.getQuestionByName("reasoning").visible = true;
    survey.activePage.getFirstQuestionToFocus().wasMistakes = true;
  } else {
    survey.activePage.getQuestionByName("reasoning").visible = false;
  }
}
function onCurrentPageChanging(survey, option) {
  if (!config.preventPageChangeOnIncorrect) {
    return;
  }
  if (option.isPrevPage) {
    return;
  }
  if (!option.oldCurrentPage.getFirstQuestionToFocus().isAnswerCorrect()) {
    option.allowChanging = false
    option.oldCurrentPage.getQuestionByName("reasoning").visible = true;
    document.getElementById("questions").focus();
    option.oldCurrentPage.getFirstQuestionToFocus().wasMistakes = true;
  } else {
    option.oldCurrentPage.getQuestionByName("reasoning").visible = false;
  }
}

function onTextMarkdown(survey, options) {
  // Convert Markdown to HTML
  let str = converter.makeHtml(options.text);
  if (str.slice(0, 3) == "<p>") {
    str = str.slice(3);
  }
  if (str.slice(-4) == "</p>") {
    str = str.slice(0, -4);
  }
  options.html = str;
}

function arrayShuffle(array) {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex]
    ];
  }

  return array;
}
