var converter;

var config = {
  tableLink:
    "https://docs.google.com/spreadsheets/d/1UvH8jHZu3mLjZv-gJaMIZOXlwkOBm_pnZrCUsW9f1Mk/edit#gid=0?usp=sharing",
  preventPageChangeOnIncorrect: true,
  insertPre: true,
  request: "select A,B,C,D,E,F,G,H Where C != 'Question' AND C = 'C2Q23'",
  recordsCount: 50,
  excludeUnfilledQuestions: true,
  limitRecordsAfterShuffling: true,
  timePerQuestion: (90 * 60) / 50,
  initialization: true,
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
  var questions = survey.getQuestionsByNames(Object.keys(answers));
  var resultsByQuestion = questions.map(q => { 
    return {
      question: q.name,
      answer: answers[q.name],
      correctAnswer: q.correctAnswer,
      isAnswerCorrect: q.isAnswerCorrect(),
      wasMistakes: +(q.hasOwnProperty('wasMistakes') ? q.wasMistakes : !q.isAnswerCorrect()),
      date: formatDate(new Date())
    };
  });
  var tableWithResult = resultsByQuestion.map(r => `${r.question}\t${r.wasMistakes}\t${r.answer}\t${r.date}`).join('\n');
  copyToClipboard(tableWithResult);
  console.log(tableWithResult);
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
  config.preventPageChangeOnIncorrect = !setupData.testMode;
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
    '{"showQuestionNumbers": "off","elements":[{"type":"boolean","name":"shuffle","defaultValue":'+config.questionsRandomOrder+',"title":"Shuffle questions?"},{"type":"boolean","name":"shuffleAnswers","defaultValue":'+config.answersRandomOrder+',"title":"Shuffle answers?"},{"type":"boolean","name":"testMode","defaultValue":'+!config.preventPageChangeOnIncorrect+',"title":"Test mode?"},{"type":"text","name":"questionCount","inputType":"number","title":"Questions count?","defaultValue":'+config.recordsCount+',"validators": [{ "type": "numeric", "text": "Value must be a number", "minValue":1, "maxValue": 231 }]},{"type": "dropdown","defaultValue":"none","name": "chapter","noneText":"all", "title": "Which chapter need to exam?","isRequired": true,"colCount": 0,"showNoneItem": true, "choices":' +
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
  var jsonString =
    '{"title":"OCP Test","showProgressBar": "bottom","showTimerPanel": "top","maxTimeToFinish": ' +
    config.timePerQuestion * (config.recordsCount !== undefined ? Math.min(config.recordsCount, pages.length) : pages.length) +
    ', "completedHtml":"<h4>You got <b>{correctAnswers}</b> out of <b>{questionCount}</b> correct answers. Question ids with wrong answers are printed to console.</h4>", "completedHtmlOnCondition": [{"expression": "{correctAnswers} == 0","html": "<h4>Unfortunately, none of your answers is correct. Please try again. Question ids are printed to console.</h4>"}, {"expression": "{correctAnswers} == {questionCount}","html": "<h4>Congratulations! You answered all the questions correctly!</h4>"}], "pages":' +
    JSON.stringify(
      config.questionsRandomOrder
        ? config.limitRecordsAfterShuffling
          ? arrayShuffle(pages).slice(0, config.recordsCount)
          : arrayShuffle(pages)
        : config.limitRecordsAfterShuffling
          ? pages.slice(0, config.recordsCount)
          : pages
    ) +
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
