var converter;

var config = {
  tableLink:
    "https://docs.google.com/spreadsheets/d/1UvH8jHZu3mLjZv-gJaMIZOXlwkOBm_pnZrCUsW9f1Mk/edit#gid=0?usp=sharing",
  preventPageChangeOnIncorrect: true,
  insertPre: true,
  request: "select A,B,C,D,E,F,G,H Where D != '' AND C != 'Question'",
  recordsCount: 50,
  limitRecordsAfterShuffling: true,
  timePerQuestion: (90 * 60) / 50,
  initialization: true,
  questionsRandomOrder: true
};

$(function () {
  init();

  if (config.initialization) {
    requestTable(
      "select A, B, count(C) where (C != '' AND A != 'Book') group by A, B order by B asc",
      function (response) {
        console.log(response);

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
    requestTable(config.request, function (response) {
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
        : config.recordsCount - 1,
    query: filter,
    rowTemplate: template(templateId || "template"),
    callback: function (error, options, response) {
      if (error == null) {
        callback(response);
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
    onCompleting: onCompleting,
    onComplete: (data) => alert(JSON.stringify(data.data)),
    onCurrentPageChanging: onCurrentPageChanging,
    onTextMarkdown: onTextMarkdown
  });
}

function fulfilSetupConfig(setupData, config) {
  console.log(JSON.stringify(setupData));
  /*chapter: "Practice Exam 1"
questionCount: "1"
shuffle:true
testMode: true*/
  config.questionsRandomOrder = setupData.shuffle;
  config.preventPageChangeOnIncorrect = !setupData.testMode;
  config.recordsCount = +setupData.questionCount;
  if (setupData.chapter !== "none") {
    config.request =
      "select A,B,C,D,E,F,G,H Where D != '' AND C != 'Question' AND B = '" +
      setupData.chapter +
      "'";
  } else {
    config.request = "select A,B,C,D,E,F,G,H Where D != '' AND C != 'Question'";
  }
}

function combineSetupSurvey(html) {
  var choices = JSON.parse("[" + html.slice(0, -1) + "]");
  var jsonString =
    '{"showQuestionNumbers": "off","elements":[{"type":"boolean","name":"shuffle","defaultValue":'+config.questionsRandomOrder+',"title":"Перемешать?"},{"type":"boolean","name":"testMode","defaultValue":'+!config.preventPageChangeOnIncorrect+',"title":"Режим теста?"},{"type":"text","name":"questionCount","inputType":"number","title":"Количество вопросов?","defaultValue":'+config.recordsCount+',"validators": [{ "type": "numeric", "text": "Value must be a number", "minValue":1, "maxValue": 231 }]},{"type": "dropdown","defaultValue":"none","name": "chapter","noneText":"all", "title": "Which chapter need to exam?","isRequired": true,"colCount": 0,"showNoneItem": true, "choices":' +
    JSON.stringify(choices) +
    "}]}";
  var json = JSON.parse(jsonString);
  console.log(json);
  return json;
}

function template(id) {
  return Handlebars.compile($("#" + id).html());
}

function transformQuestions(html) {
  var pages = JSON.parse("[" + html.slice(0, -1) + "]");
  var jsonString =
    '{"title":"OCP Test","showProgressBar": "bottom","showTimerPanel": "top","maxTimeToFinish": ' +
    config.timePerQuestion * config.recordsCount +
    ', "completedHtml":"<h4>You got <b>{correctAnswers}</b> out of <b>{questionCount}</b> correct answers.</h4>", "completedHtmlOnCondition": [{"expression": "{correctAnswers} == 0","html": "<h4>Unfortunately, none of your answers is correct. Please try again.</h4>"}, {"expression": "{correctAnswers} == {questionCount}","html": "<h4>Congratulations! You answered all the questions correctly!</h4>"}], "pages":' +
    JSON.stringify(
      config.questionsRandomOrder
        ? config.limitRecordsAfterShuffling
          ? arrayShuffle(pages).slice(0, config.recordsCount)
          : arrayShuffle(pages)
        : pages
    ) +
    "}";
  var json = JSON.parse(jsonString);
  console.log(json);
  return json;
}

function splitVariants(variants) {
  return JSON.stringify(
    variants
      .split(/[\\]n/)
      .filter((s) => s || s.trim())
      .map((v) => {
        return { value: v.slice(0, 2), text: config.insertPre ? addPre(v) : v };
      })
  );
}

function addPre(s) {
  return "<pre>" + s + "</pre>";
}
function delPre(s) {
  return s.slice(5, -6);
}

function getFullCorrectAnswers(answers, variants) {
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
}

function escapeString(json) {
  var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
  var meta = {
    // table of character substitutions
    "\b": "\\b",
    "\t": "\\t",
    "\n": "\\n",
    "\f": "\\f",
    "\r": "\\r",
    '"': '\\"',
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
    option.allowChanging = false;
    option.oldCurrentPage.getQuestionByName("reasoning").visible = true;
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