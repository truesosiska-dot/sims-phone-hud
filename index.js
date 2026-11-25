import { eventSource, event_types, getContext, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const EXTENSION_NAME = 'sims-phone-hud';

const MOOD_STYLES = {
    'счастлив': { color: '#4caf50', icon: '😊' },
    'кокетливый': { color: '#ff4081', icon: '😘' },
    'игривый': { color: '#9c27b0', icon: '😜' },
    'уверенный': { color: '#2196f3', icon: '😎' },
    'вдохновлённый': { color: '#00bcd4', icon: '✨' },
    'внимательный': { color: '#673ab7', icon: '🧐' },
    'злой': { color: '#f44336', icon: '😡' },
    'грустный': { color: '#3f51b5', icon: '😢' },
    'напряжённый': { color: '#ff9800', icon: '😰' },
    'дискомфорт': { color: '#ff5722', icon: '😣' },
    'смущённый': { color: '#ffc107', icon: '😳' },
    'сонный': { color: '#607d8b', icon: '😴' },
    'нейтральный': { color: '#78909c', icon: '😐' }
};

const defaultState = {
    mood: 'Нейтральный',
    reason: 'Обычное состояние',
    needs: { energy: 80, social: 75, fun: 70, comfort: 85 },
    rpTime: '14:00',
    rpDate: 'День 1',
    weather: 'Ясно, +20°C',
    weatherIcon: '☀️',
    messages: []
};

let currentState = JSON.parse(JSON.stringify(defaultState));
let isAwaitingSms = false;

function getChatKey() {
    const context = getContext();
    return context.chatId || 'default_chat';
}

function loadChatState() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = {};
    }
    const key = getChatKey();
    if (extension_settings[EXTENSION_NAME][key]) {
        currentState = { ...JSON.parse(JSON.stringify(defaultState)), ...extension_settings[EXTENSION_NAME][key] };
    } else {
        currentState = JSON.parse(JSON.stringify(defaultState));
    }
    renderUI();
}

function saveChatState() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = {};
    }
    extension_settings[EXTENSION_NAME][getChatKey()] = currentState;
    saveSettingsDebounced();
}

function getMoodConfig(moodText) {
    const lower = (moodText || '').toLowerCase();
    for (const [key, val] of Object.entries(MOOD_STYLES)) {
        if (lower.includes(key)) return val;
    }
    return { color: '#4caf50', icon: '💎' };
}

function getBarColor(val) {
    if (val > 50) return '#4caf50';
    if (val > 25) return '#ff9800';
    return '#f44336';
}

function buildUI() {
    if ($('#sims-hud-dock').length) return;

    const html = `
        <div id="sims-hud-dock">
            <div id="sims-mood-toggle" title="Настроение персонажа (The Sims)">
                <div class="sims-plumbob"></div>
            </div>
            <div id="iphone-toggle" title="Открыть телефон">
                📱
                <span id="iphone-unread-badge">1</span>
            </div>
        </div>

        <div id="sims-mood-panel">
            <div class="sims-header">
                <div class="sims-mood-icon" id="sims-panel-icon">😊</div>
                <div class="sims-mood-info">
                    <h4 id="sims-panel-mood">Нейтральный</h4>
                    <p id="sims-panel-reason">Обычное состояние</p>
                </div>
            </div>
            <div class="sims-needs">
                <div class="sims-need-row">
                    <div class="sims-need-label"><span>⚡ Бодрость</span><span id="val-energy">80%</span></div>
                    <div class="sims-bar-bg"><div class="sims-bar-fill" id="bar-energy" style="width:80%"></div></div>
                </div>
                <div class="sims-need-row">
                    <div class="sims-need-label"><span>💬 Общение</span><span id="val-social">75%</span></div>
                    <div class="sims-bar-bg"><div class="sims-bar-fill" id="bar-social" style="width:75%"></div></div>
                </div>
                <div class="sims-need-row">
                    <div class="sims-need-label"><span>🎮 Досуг</span><span id="val-fun">70%</span></div>
                    <div class="sims-bar-bg"><div class="sims-bar-fill" id="bar-fun" style="width:70%"></div></div>
                </div>
                <div class="sims-need-row">
                    <div class="sims-need-label"><span>🛋️ Уют</span><span id="val-comfort">85%</span></div>
                    <div class="sims-bar-bg"><div class="sims-bar-fill" id="bar-comfort" style="width:85%"></div></div>
                </div>
            </div>
        </div>

        <div id="iphone-container">
            <div class="iphone-screen">
                <div class="iphone-statusbar">
                    <span id="iphone-top-time">14:00</span>
                    <div class="iphone-island"></div>
                    <span>5G 🔋</span>
                </div>

                <div class="iphone-weather-bar">
                    <div class="iphone-weather-left">
                        <span class="iphone-rp-date" id="iphone-rp-date">День 1</span>
                        <span class="iphone-rp-weather" id="iphone-rp-weather">Ясно, +20°C</span>
                    </div>
                    <div class="iphone-weather-icon" id="iphone-weather-icon">☀️</div>
                </div>

                <div class="iphone-chat-header">
                    <div class="iphone-contact-info">
                        <div class="iphone-avatar" id="iphone-char-avatar">П</div>
                        <span class="iphone-contact-name" id="iphone-char-name">Персонаж</span>
                    </div>
                    <button class="iphone-close-btn" id="iphone-close-btn">Закрыть</button>
                </div>

                <div class="iphone-messages" id="iphone-messages-list"></div>

                <div class="iphone-input-area">
                    <input type="text" id="iphone-msg-input" placeholder="iMessage..." autocomplete="off" />
                    <button id="iphone-send-btn">↑</button>
                </div>
            </div>
        </div>
    `;

    $('body').append(html);

    $('#sims-mood-toggle').on('click', () => {
        $('#iphone-container').removeClass('open');
        $('#sims-mood-panel').toggleClass('open');
    });

    $('#iphone-toggle').on('click', () => {
        $('#sims-mood-panel').removeClass('open');
        $('#iphone-container').toggleClass('open');
        if ($('#iphone-container').hasClass('open')) {
            $('#iphone-unread-badge').hide();
            scrollPhoneToBottom();
        }
    });

    $('#iphone-close-btn').on('click', () => {
        $('#iphone-container').removeClass('open');
    });

    $('#iphone-send-btn').on('click', sendPhoneMessage);
    $('#iphone-msg-input').on('keypress', (e) => {
        if (e.which === 13) sendPhoneMessage();
    });
}

function renderUI() {
    const context = getContext();
    const charName = context.name2 || 'Персонаж';

    const moodCfg = getMoodConfig(currentState.mood);
    $('#sims-mood-toggle').css('border-color', moodCfg.color);
    $('.sims-plumbob').css('background', moodCfg.color);
    $('#sims-mood-panel').css('border-color', moodCfg.color);
    $('#sims-panel-icon').css('background', moodCfg.color).text(moodCfg.icon);
    $('#sims-panel-mood').text(currentState.mood);
    $('#sims-panel-reason').text(currentState.reason);

    for (const key of ['energy', 'social', 'fun', 'comfort']) {
        const val = Math.max(0, Math.min(100, Number(currentState.needs[key]) || 50));
        $(`#val-${key}`).text(`${val}%`);
        $(`#bar-${key}`).css({ width: `${val}%`, background: getBarColor(val) });
    }

    $('#iphone-top-time').text(currentState.rpTime);
    $('#iphone-rp-date').text(currentState.rpDate);
    $('#iphone-rp-weather').text(currentState.weather);
    $('#iphone-weather-icon').text(currentState.weatherIcon);
    $('#iphone-char-name').text(charName);
    $('#iphone-char-avatar').text(charName.charAt(0).toUpperCase());

    const list = $('#iphone-messages-list');
    list.empty();
    currentState.messages.forEach(msg => {
        const side = msg.sender === 'user' ? 'user' : 'bot';
        list.append(`
            <div class="imsg-bubble-wrap ${side}">
                <div class="imsg-bubble">${$('<div>').text(msg.text).html()}</div>
                <span class="imsg-time">${msg.time || currentState.rpTime}</span>
            </div>
        `);
    });
    scrollPhoneToBottom();
}

function scrollPhoneToBottom() {
    const el = document.getElementById('iphone-messages-list');
    if (el) el.scrollTop = el.scrollHeight;
}

async function sendPhoneMessage() {
    const input = $('#iphone-msg-input');
    const text = input.val().trim();
    if (!text || isAwaitingSms) return;

    input.val('');
    isAwaitingSms = true;
    $('#iphone-send-btn').prop('disabled', true);

    currentState.messages.push({
        sender: 'user',
        text: text,
        time: currentState.rpTime
    });
    saveChatState();
    renderUI();

    const textarea = $('#send_textarea');
    const sendBtn = $('#send_but');
    if (textarea.length && sendBtn.length) {
        textarea.val(`[SMS с телефона]: ${text}`);
        textarea.trigger('input');
        sendBtn.trigger('click');
    } else {
        isAwaitingSms = false;
        $('#iphone-send-btn').prop('disabled', false);
    }
}

eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (data) => {
    const systemInstruction = `
[System Note: В самом конце каждого своего ответа обязательно добавь служебный XML-блок (он будет скрыт от пользователя) с актуальным состоянием персонажа и мира по сюжету:
<rp_hud>
  <mood>Эмоция одним словом (Счастлив/Кокетливый/Игривый/Уверенный/Вдохновлённый/Злой/Грустный/Напряжённый/Дискомфорт/Смущённый/Сонный/Нейтральный)</mood>
  <reason>Краткая причина эмоции (3-6 слов)</reason>
  <energy>0-100</energy>
  <social>0-100</social>
  <fun>0-100</fun>
  <comfort>0-100</comfort>
  <time>Сюжетное время ЧЧ:ММ</time>
  <date>Сюжетный день/дата</date>
  <weather>Погода и температура</weather>
  <weather_icon>Один эмодзи погоды (☀️/⛅/🌧️/❄️/🌙/⛈️)</weather_icon>
  <sms_reply>Если пользователь написал [SMS с телефона] или персонаж сам пишет СМС — впиши сюда только текст ответа в мессенджер, иначе оставь пустым</sms_reply>
</rp_hud>]`;

    if (Array.isArray(data.chat)) {
        data.chat.push({ role: 'system', content: systemInstruction });
    }
});

eventSource.on(event_types.MESSAGE_RECEIVED, (messageId) => {
    const context = getContext();
    const msg = context.chat[messageId];
    if (!msg || msg.is_user) return;

    const rawText = msg.mes;
    const hudMatch = rawText.match(/<rp_hud>([\s\S]*?)<\/rp_hud>/i);

    if (hudMatch) {
        const xml = hudMatch[1];
        const getTag = (tag) => {
            const m = xml.match(new RegExp(`<${tag}>([\s\S]*?)<\/${tag}>`, 'i'));
            return m ? m[1].trim() : null;
        };

        const mood = getTag('mood');
        const reason = getTag('reason');
        const energy = getTag('energy');
        const social = getTag('social');
        const fun = getTag('fun');
        const comfort = getTag('comfort');
        const time = getTag('time');
        const date = getTag('date');
        const weather = getTag('weather');
        const weatherIcon = getTag('weather_icon');
        const smsReply = getTag('sms_reply');

        if (mood) currentState.mood = mood;
        if (reason) currentState.reason = reason;
        if (energy) currentState.needs.energy = parseInt(energy, 10);
        if (social) currentState.needs.social = parseInt(social, 10);
        if (fun) currentState.needs.fun = parseInt(fun, 10);
        if (comfort) currentState.needs.comfort = parseInt(comfort, 10);
        if (time) currentState.rpTime = time;
        if (date) currentState.rpDate = date;
        if (weather) currentState.weather = weather;
        if (weatherIcon) currentState.weatherIcon = weatherIcon;

        if (smsReply && smsReply.length > 0 && smsReply.toLowerCase() !== 'none' && smsReply !== '-') {
            currentState.messages.push({
                sender: 'bot',
                text: smsReply,
                time: currentState.rpTime
            });
            if (!$('#iphone-container').hasClass('open')) {
                $('#iphone-unread-badge').show();
            }
        }

        msg.mes = rawText.replace(/<rp_hud>[\s\S]*?<\/rp_hud>/gi, '').trim();
        $(`.mes[mesid="${messageId}"] .mes_text`).html(context.messageFormatting(msg.mes, msg.name, msg.is_system, msg.is_user, messageId));

        saveChatState();
        renderUI();
    }

    isAwaitingSms = false;
    $('#iphone-send-btn').prop('disabled', false);
});

eventSource.on(event_types.CHAT_CHANGED, () => {
    loadChatState();
});

jQuery(async () => {
    buildUI();
    loadChatState();
});
