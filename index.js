const math = require('mathjs')
const Telegraf = require('telegraf')
const Markup = require('telegraf/markup')
const session = require('telegraf/session')
const Stage = require('telegraf/stage')
const WizardScene = require('telegraf/scenes/wizard')
const Parser = require('rss-parser')
const LanguageToolApi = require('language-grammar-api')
const google = require('@vitalets/google-translate-api')
google.languages['zh'] = 'Chinese'
const weather = require('openweather-apis')
const { Airgram, Auth, prompt, toObject } = require('airgram')
const mongoose = require('mongoose')
mongoose.Promise = require('bluebird')
const token = '1263913563:AAErtzkuxA62IDJM7dwyFcfAaF91PCW4HgA'
const api_id = 1108561
const api_hash = '22e142b0bf414e371230aae197914756'
const options = { endpoint: 'https://languagetool.org/api/v2' }
const parser = new Parser()
const bot = new Telegraf(token)
const languageToolClient = new LanguageToolApi(options)

const airgram = new Airgram({
    apiId: api_id,
    apiHash: api_hash,
    logVerbosityLevel: 2
})
mongoose.connect('mongodb://localhost/testmongoose', {useNewUrlParser: true, useUnifiedTopology: true})
airgram.use(new Auth({
    code: () => prompt('code'),
    phoneNumber: '79963218913'
}))
const userSchema = mongoose.Schema({
    uid: Number,
    mid: Number,
    inlink: String,
    title: String,
})
const tipsSchema = mongoose.Schema({
    uid: Number,
    text: String,
    time: String
})
const User = mongoose.model('User', userSchema)
const Tip = mongoose.model('Tip', tipsSchema)

const gram = new WizardScene(
    'gram',
    (ctx) => {
        ctx.reply('На каком языке написан текст?', Markup.inlineKeyboard([
            Markup.callbackButton('ru', 'ru'),
            Markup.callbackButton('en', 'en'),
            Markup.callbackButton('fr', 'fr'),
            Markup.callbackButton('de', 'de'),
            Markup.callbackButton('zh', 'zh'),
            Markup.callbackButton('ja', 'ja'),
            Markup.callbackButton('es', 'es'),
            Markup.callbackButton('it', 'it')
        ]).extra())
        return ctx.wizard.next()
    },
    (ctx) => {
        try {
            ctx.wizard.state.call = ctx.callbackQuery.data
            ctx.answerCbQuery()
            ctx.editMessageText('Введите текст, который нужно исправить')
            return ctx.wizard.next()
        }
        catch (e) {
            ctx.reply('Нажмите на кнопку выше')
        }
    },
    async (ctx) => {
        const check = await languageToolClient.check({
            text: ctx.message.text,
            language: ctx.wizard.state.call // required (you can use .languages call to get language)
        })
        let mas = ctx.message.text
        if (check['language']['detectedLanguage']['name'] === check['language']['name']) {
            for (let z = 0; z < check['matches'].length; z++) {
                mas = mas.slice(0, check['matches'][z]['offset'] + z) + check['matches'][z]['replacements'][0]['value'] + mas.slice(check['matches'][z]['offset'] + check['matches'][z]['length'] + z)
            }
            ctx.reply(mas)
        }
        else {
            ctx.reply('Язык выбран неверно. Проверка невозможна.')
        }
        return ctx.scene.leave()
    }
)

const weat = new WizardScene(
    'weat',
    (ctx) => {
        ctx.reply('В каком городе Вы хотите узнать погоду?')
        return ctx.wizard.next()
    },
    (ctx) => {
        wat(ctx.message.text, function (val) {
            ctx.reply(val)
        })
        ctx.scene.leave()
    }
)

const tnews = new WizardScene(
    'tnews',
    (ctx) => {
        ctx.reply('Что вы хотите сделать?', Markup.inlineKeyboard([
            Markup.callbackButton('Подписаться на новый канал', 'new'),
            Markup.callbackButton('Посмотреть список подписок', 'check'),
            Markup.callbackButton('Отписаться от канала', 'delete')
        ]).extra())
        return ctx.wizard.next()
    },
    (ctx) => {
        ctx.wizard.state.call = ctx
        if (ctx.wizard.state.call.updateType === 'message') {
            ctx.reply('Нажмите на кнопку выше')
        }
        if (ctx.wizard.state.call.updateType === 'callback_query') {
            if (ctx.wizard.state.call.update.callback_query.data === 'new') {
                ctx.reply('Мне нужна invite-ссылка')
                ctx.answerCbQuery()
                ctx.wizard.selectStep(2)
            }
            if (ctx.wizard.state.call.update.callback_query.data === 'check') {
                let mes = ''
                User.find({uid: ctx.wizard.state.call.update.callback_query.from.id}).then(users => {
                    for (let i = 0; i < users.length; i++) {
                        mes = mes + users[i]['title'] + ' ' + users[i]['inlink'] + '\n'
                    }
                    ctx.reply(mes)
                })
                ctx.answerCbQuery()
                ctx.scene.leave()
            }
            if (ctx.wizard.state.call.update.callback_query.data === 'delete') {
                ctx.reply('Введите названия каналов, от которых вы хотите отписаться, через запятую')
                ctx.answerCbQuery()
                ctx.wizard.selectStep(3)
            }
        }
    },
    (ctx) => {
        let mes = ctx.message.text
        airgram.api.joinChatByInviteLink({inviteLink: mes}).then(link => {
            if (link.response.message === 'USER_ALREADY_PARTICIPANT') {
                User.find({inlink: mes, uid: ctx.message.from.id}).then(users => {
                    if (users.length === 0) {
                        airgram.api.checkChatInviteLink({inviteLink: mes}).then(chat => {
                            let user = new User ({
                                uid: ctx.message.from.id,
                                mid: chat.response.chatId,
                                inlink: mes,
                                title: chat.response.title
                            })
                            user.save().then()
                            ctx.reply('Вы успешно подписались')
                        })
                    }
                    if (users.length !== 0) {
                        if (users[0]['uid'] === ctx.message.from.id) {
                            ctx.reply('Вы уже подписаны')
                        }
                    }
                })
            }
            if (link.response.message === 'Wrong invite link') {
                ctx.reply('Неверная invite-ссылка')
            }
            if ('chat' in link.response) {
                let user = new User({
                    uid: ctx.message.from.id,
                    mid: link.response.id,
                    inlink: mes,
                    title: link.response.title
                })
                user.save().then()
                ctx.reply('Вы успешно подписались')
            }
        })
        ctx.scene.leave()
    },
    (ctx) => {
        let mes = ctx.message.text.split(',')
        for (let i = 0; i < mes.length; i++) {
            User.deleteMany({title: mes[i], uid: ctx.message.from.id}).then(del => {
                if (del['n'] === 0) {
                    ctx.reply('Вы не подписаны на данный(е) канал(ы)')
                }
                else {
                    ctx.reply('Подписка отменена')
                }
            })
        }
        ctx.scene.leave()
    }
)

const trans = new WizardScene(
    'trans', // Имя сцены
    (ctx) => {
        ctx.reply('С какого языка перевести?', Markup.inlineKeyboard([
            Markup.callbackButton('ru', 'ru'),
            Markup.callbackButton('en', 'en'),
            Markup.callbackButton('fr', 'fr'),
            Markup.callbackButton('de', 'de'),
            Markup.callbackButton('zh', 'zh'),
            Markup.callbackButton('ja', 'ja'),
            Markup.callbackButton('es', 'es'),
            Markup.callbackButton('it', 'it')
        ]).extra())
        return ctx.wizard.next()
    },
    (ctx) => {
        try {
            ctx.wizard.state.call = ctx.callbackQuery.data
            ctx.answerCbQuery()
            ctx.editMessageText('На какой язык перевести?', Markup.inlineKeyboard([
                Markup.callbackButton('ru', 'ru'),
                Markup.callbackButton('en', 'en'),
                Markup.callbackButton('fr', 'fr'),
                Markup.callbackButton('de', 'de'),
                Markup.callbackButton('zh', 'zh'),
                Markup.callbackButton('ja', 'ja'),
                Markup.callbackButton('es', 'es'),
                Markup.callbackButton('it', 'it')
            ]).extra())
            return ctx.wizard.next()
        }
        catch (e) {
            ctx.reply('Нажмите на кнопку выше')
        }
    },
    (ctx) => {
        try {

            let yz = ctx.wizard.state.call
            ctx.wizard.state.call = ctx.callbackQuery.data
            ctx.wizard.state.call = yz + ' ' + ctx.wizard.state.call
            ctx.answerCbQuery()
            ctx.editMessageText('Введите текст для перевода')
            return ctx.wizard.next()
        }
        catch (e) {
            ctx.reply('Нажмите на кнопку выше')
        }
    },
    (ctx) => {
        let lan = ctx.wizard.state.call.split(' ')
        google(ctx.message.text, {to: lan[1], from: lan[0]}).then(text => {
            return ctx.reply(text['text'])
        })
        ctx.scene.leave()
    }
)

const evaling = new WizardScene (
    'evaling',
    (ctx) => {
        ctx.reply('Введите выражение для подсчета')
        return ctx.wizard.next()
    },
    (ctx) => {
        try {
            let res = math.evaluate(ctx.message.text)
            ctx.reply(res)
        }
        catch (err) {
            ctx.reply('В выражении ошибка. Исправьте и повторите попытку')
        }
        ctx.scene.leave()
    }
)

const tips = new WizardScene (
    'tips',
    (ctx) => {
        ctx.reply('Введите заметку в формате "Время Заметка"')
        return ctx.wizard.next()
    },
    (ctx) => {
        let mes = ctx.message.text.split(' ')
        let tippy = ''
        for (let i = 1; i < mes.length; i++) {
            tippy = tippy + ' ' + mes[i]
        }
        let tip = new Tip ({
            uid: ctx.from.id,
            text: tippy,
            time: mes[0]
        })
        tip.save().then()
        ctx.scene.leave()
    }
)

const tictac = new WizardScene (
    'tictac',
    (ctx) => {
        ctx.replyWithGame('tictactoe')
        return ctx.wizard.next()
    },
    (ctx) => {
        ctx.wizard.state.call = ctx
        if ('callback_query' in ctx.wizard.state.call.update) {
            bot.telegram.answerGameQuery(ctx.wizard.state.call.update.callback_query.id, 'http://pupik.mcdir.ru/ticTacToe/index.html').then(ctx.answerCbQuery())
            ctx.scene.leave()
        }
        else {
            ctx.reply('Нажмите на кнопку выше')
        }
    }
)

const stage = new Stage()
stage.register(trans)
stage.register(weat)
stage.register(gram)
stage.register(tictac)
stage.register(tips)
stage.register(tnews)
stage.register(evaling)
bot.use(session())
bot.use(stage.middleware())

async function feeder () {
    let news = [[],[],[]]
    let feed = await parser.parseURL('https://news.yandex.ru/index.rss')
    for (let i = 0; i < 5; i++) {
        news[0][i] = feed['items'][i]['title']
        news[1][i] = feed['items'][i]['content']
        news[2][i] = feed['items'][i]['link']
    }
    return news
}
function wat (msg, fn) {
    weather.setAPPID('96ef2315489599a4fd0b81a70aff38fb')
    weather.setCity(msg)
    weather.setLang('ru')
    weather.getAllWeather(function (err, JSONObj) {
        if (JSONObj["message"] ==='city not found') fn('Извините, я не знаю такого города')
        else fn('На улице: '+JSONObj['weather'][0]['description']+'\nТемпература: '+JSONObj['main']['temp']+'°C\nВлажность: '+JSONObj['main']['humidity']+'мм рт.ст.\nСкорость ветра: '+JSONObj['wind']['speed']+'м/сек')
    })
}

setInterval(function () {
    let curDate = new Date().getHours() + ':' + new Date().getMinutes()
    Tip.countDocuments({}).then( count => {
        for (let i = 0; i < count; i++) {
            Tip.find().then(tips => {
                if (tips[i]['time'] === curDate) {
                    bot.telegram.sendMessage(tips[count-1]['uid'], 'Напоминание: ' + tips[count-1]['text'])
                    Tip.deleteOne({time: curDate}).then()
                }
            })
        }
    })
},1000)

bot.telegram.sendMessage(732444947, 'Служебное сообщение')
airgram.on('updateNewMessage', ({update}, next) => {
    const {message} = update
    User.find({mid: message.chatId}).then(users => {
        if (users.length !== 0) {
            airgram.api.forwardMessages({
                chatId: 1263913563,
                fromChatId: message.chatId,
                messageIds: [message.id],
                asAlbum: true,
            })
        }
    })
    return next()
})

bot.start((ctx) => ctx.reply('Здравствуйте, я Диплом\nДля получения справки напишите "/help"'))
bot.help((ctx) => ctx.reply('/game - игра "Крестики-нолики"\n/translate - переводчик\n/tips - напоминания\n/tnews - подписка на рассылку новостей telegram-каналов\n/evaling - калькулятор\n/weather - погода\n/news - новости\n/grammar - исправление текста'))
bot.command('news', (ctx) => {
    feeder().then(val => {
        for (let i = 0; i < 5; i++) {
            ctx.reply("ℹ️" + val[0][i] + "\n" + val[1][i], Markup.inlineKeyboard([
                Markup.urlButton('Перейти к новости', val[2][i]),
            ]).extra())
        }
    })
})
bot.command('game', (ctx) => ctx.scene.enter('tictac'))
bot.command('translate', (ctx) => ctx.scene.enter('trans'))
bot.command('tips', (ctx) => ctx.scene.enter('tips'))
bot.command('tnews', (ctx) => ctx.scene.enter('tnews'))
bot.command('evaling', (ctx) => ctx.scene.enter('evaling'))
bot.command('weather', (ctx) => ctx.scene.enter('weat'))
bot.command('grammar', (ctx) => ctx.scene.enter('gram'))
bot.on('forward', (ctx) => {
    if (ctx.message.from.id === 732444947) {
        if ('forward_from_chat' in ctx.message) {
            User.find({mid: ctx.message.forward_from_chat.id}).then(users => {
                for ( let i = 0; i < users.length; i++) {
                    bot.telegram.forwardMessage(users[i]['uid'], 732444947, ctx.message.message_id)
                }
            })
        }
    }
})

bot.startPolling()
