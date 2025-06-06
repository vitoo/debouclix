
///////////////////////////////////////////////////////////////////////////////////////
// POST MESSAGE
///////////////////////////////////////////////////////////////////////////////////////

function getAuthorFromMessageElem(messageElement) {
    return messageElement?.querySelector('.bloc-pseudo-msg.text-user,.bloc-pseudo-msg.text-modo,.bloc-pseudo-msg.text-admin,.jvchat-author')?.textContent?.trim() ?? '';
}

function getDateFromMessageElem(messageElement) {
    return messageElement.querySelector('.bloc-date-msg')?.textContent?.trim() ?? '';
}

function getRawTypedMessage(text) {
    if (!text?.length) {
        const textArea = document.querySelector('#message_topic');
        if (!textArea?.value?.length) return '';
        text = textArea.value;
    }
    const regex = new RegExp(/^[^>].*/, 'gmi');
    return text.match(regex)?.join('\n')?.trim() ?? text.trim();
}

function prepareMessageQuoteInfo(messageElement) {
    const currentUserPseudo = userPseudo ?? store.get(storage_lastUsedPseudo, userId);
    return {
        userId: userId,
        quotedMessageId: messageElement.getAttribute('data-id') ?? messageElement.getAttribute('jvchat-id'),
        quotedUsername: getAuthorFromMessageElem(messageElement).toLowerCase(),
        quotedMessageUrl: messageElement.querySelector('.bloc-date-msg .lien-jv')?.href,
        newMessageId: 0, // filled after redirect
        newMessageUsername: currentUserPseudo?.toLowerCase() ?? 'anonymous',
        newMessageContent: '', // filled at validation
        newMessageUrl: '', // filled after redirect
        topicId: currentTopicId,
        topicUrl: window.location.origin + window.location.pathname,
        topicTitle: getTopicTitle(),
        status: 'pending',
        lastUpdateDate: new Date()
    }
}

function fixNoelshackDirectUrl() {
    let message = document.querySelector('#message_topic').value;
    if (message.match(/https:\/\/www\.noelshack\.com\/\d+-\d+-\d+-.*\..*/i)) {
        message = buildNoelshackDirectUrl(message);
        document.querySelector('#message_topic').value = message
    }
}

async function handlePostMessage() {
    bypassTextCensorship();
    await validatePendingMessageQuotes();
}

function bypassTextCensorship() {
    const textArea = document.querySelector('#message_topic');
    if (textArea?.value?.length) {
        setTextAreaValue(textArea, textArea.value.replaceAll(/d[e|é]boucled/gi, 'Déb0ucled'));
        setTextAreaValue(textArea, textArea.value.replaceAll(/d[e|é]censured/gi, 'Déc3nsured'));
    }

    const titleArea = document.querySelector('#input-topic-title');
    if (titleArea?.value?.length) {
        titleArea.value = titleArea.value.replaceAll(/d[e|é]boucled/gi, 'Déb0ucled');
        titleArea.value = titleArea.value.replaceAll(/d[e|é]censured/gi, 'Déc3nsured');
    }
}

async function validatePendingMessageQuotes() {
    fixNoelshackDirectUrl()
    const rawMessage = getRawTypedMessage();
    const newStatus = rawMessage?.length ? 'validated' : 'canceled'; // Citation vide
    messageQuotesPendingArray
        .filter(mqp =>
            mqp.status === 'pending'
            && mqp.topicId === currentTopicId)
        .forEach(mqp => {
            mqp.newMessageContent = rawMessage;
            mqp.status = newStatus;
            mqp.lastUpdateDate = new Date();
        });
    await saveLocalStorage();
}

async function cleanupPendingMessageQuotes() {
    const datenow = new Date();
    messageQuotesPendingArray = messageQuotesPendingArray
        .filter((q) => { // On ne garde que les statuts pending de moins de 3 jours
            const dateExpireRange = new Date(datenow.setMinutes(datenow.getMinutes() - pendingMessageQuoteExpire.totalMinutes()));
            return (q.status !== 'validated' && q.lastUpdateDate > dateExpireRange) && q.status !== 'canceled';
        });

    await saveLocalStorage();
}

/*
async function postNewMessage() {
    const textArea = document.querySelector('#message_topic');
    if (!textArea) return;

    const formElement = document.querySelector('.form-post-message');
    if (!formElement) return;

    const formData = new FormData(formElement);

    let checkRes;
    await GM.xmlHttpRequest({
        method: 'POST',
        url: location.href,
        data: formData,
        headers: { 'Content-Type': 'application/json' },
        onload: (response) => { checkRes = response.responseText; },
        onerror: (response) => { console.error("error : %o", response); }
    });

    return checkRes;
}
*/

async function buildQuoteMessage(messageElement, selection) {
    const textArea = document.querySelector('#message_topic');
    if (!textArea) return;

    const newQuoteHeader = `> Le ${getDateFromMessageElem(messageElement)} '''${getAuthorFromMessageElem(messageElement)}''' a écrit : `;

    if (selection?.length) {
        const currentContent = textArea.value.length === 0 ? '' : `${textArea.value.trim()}\n\n`;
        const quotedText = selection.replaceAll('\n', '\n> ');
        setTextAreaValue(textArea, `${currentContent}${newQuoteHeader}\n> ${quotedText}\n\n`);
        textArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        textArea.focus({ preventScroll: true });
        textArea.setSelectionRange(textArea.value.length, textArea.value.length);
    }
    else {
        setTimeout(() => {
            const date = getDateFromMessageElem(messageElement);
            const regex = new RegExp(`> Le\\s+?${date}\\s+?:`);
            setTextAreaValue(textArea, textArea.value.replace(regex, newQuoteHeader));
        }, 600);
    }

    if (getAuthorFromMessageElem(messageElement).toLowerCase() !== userPseudo?.toLowerCase()) {
        messageQuotesPendingArray.push(prepareMessageQuoteInfo(messageElement));
        await saveLocalStorage();
    }
}

async function suggestAuthors(authorHint) {
    // Min 3 char & must be logged in
    if (authorHint?.length < 3 || !userPseudo) return undefined;

    const url = `/sso/ajax_suggest_pseudo.php?pseudo=${authorHint.trim()}`;

    let suggestions = await fetchJson(url);
    return suggestions ? [...suggestions.alias.map(s => s.pseudo)] : undefined;
}

async function suggestSmiley(hint) {
    const filteredSmileys = Array.from(fullSmileyGifMap)
        .filter(([key, value]) => key.startsWith(hint.trim().toLowerCase()));

    return filteredSmileys;
}

function getTextSelection() {
    return window.getSelection ? window.getSelection() : document.selection;
}

function getSelectionOffset(container, pointerEvent) {
    const selectionRect = getTextSelection().getRangeAt(0).getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const selectionOffsetLeft = selectionRect.left - containerRect.left + selectionRect.width - 9;
    const eventOffsetLeft = pointerEvent.pageX - container.offsetLeft - 7;
    const offsetLeft = eventOffsetLeft > selectionOffsetLeft ? selectionOffsetLeft : eventOffsetLeft;
    const offsetTop = selectionRect.top - containerRect.top + selectionRect.height + 10; // mouseEvent.pageY - container.offsetTop + 14
    return { offsetLeft: offsetLeft, offsetTop: offsetTop };
}

function addMessagePartialQuoteEvents(allMessages) {
    function buildPartialQuoteButton(message) {
        const blocContenu = message.querySelector('.bloc-contenu');
        if (!blocContenu) return;
        const partialQuoteButton = document.createElement('div');
        partialQuoteButton.className = 'deboucled-quote';
        partialQuoteButton.innerHTML = '<a class="deboucled-partial-quote-logo"></a>';
        blocContenu.appendChild(partialQuoteButton);
        return partialQuoteButton;
    }

    const clearAllQuoteButtons = () => document.querySelectorAll('.deboucled-quote').forEach(e => e.classList.toggle('active', false));

    document.onselectionchange = async function () {
        await sleep(100);
        const selection = getTextSelection().toString();
        if (!selection?.length) clearAllQuoteButtons();
    };

    allMessages.forEach((message) => {
        const partialQuoteButton = buildPartialQuoteButton(message); // Partial quote

        async function partialQuoteEvent(pointerEvent) {
            const selection = getTextSelection().toString();
            if (!selection?.length) return;

            partialQuoteButton.onclick = () => buildQuoteMessage(message, selection);

            const selectionOffset = getSelectionOffset(message, pointerEvent);
            partialQuoteButton.style.left = `${selectionOffset.offsetLeft}px`;
            partialQuoteButton.style.top = `${selectionOffset.offsetTop}px`;

            clearAllQuoteButtons();
            await sleep(100);
            partialQuoteButton.classList.toggle('active', true);
        }

        message.onpointerup = (pe) => partialQuoteEvent(pe); // Pointer events = mouse + touch + pen
        message.oncontextmenu = (pe) => partialQuoteEvent(pe); // TouchEnd/MouseUp/PointerUp does not fire on mobile (in despite of)
    });
}

function addMessageQuoteEvents(allMessages) {
    allMessages.forEach((message) => {
        const quoteButton = message.querySelector('.picto-msg-quote');
        if (quoteButton) {
            quoteButton.addEventListener('click', () => buildQuoteMessage(message)); // Full quote
        }
    });
}

//suggestion author and smiley

function addSuggestionEvent(type, element) {
    let textArea = element ? element : document.querySelector('#message_topic');

    if (!textArea) return;

    const parentContainer = textArea.parentElement;
    parentContainer.style.position = 'relative';

    // Création du container pour les suggestions
    const autocompleteElement = document.createElement('div');
    autocompleteElement.id = `deboucled-${type}-autocomplete`;
    autocompleteElement.className = 'autocomplete-jv';
    autocompleteElement.innerHTML = '<ul class="autocomplete-jv-list"></ul>';
    textArea.parentElement.appendChild(autocompleteElement);

    // Clear autocomplete suggestions
    const clearAutocomplete = (elem) => {
        elem.innerHTML = '';
        elem.parentElement.classList.toggle('on', false);
    };

    // Handle selection of a suggestion
    function autocompleteOnClick(event) {
        let val = textArea.value;
        const [bStart, bEnd] = getWordBoundsAtPosition(val, textArea.selectionEnd);

        let insertedText;
        if (type === 'author') {
            insertedText = `@${event.target.innerText} `;
        } else if (type === 'smiley') {
            insertedText = `${event.target.innerText.trim()} `;
        }

        textArea.value = `${val.substring(0, bStart)}${insertedText}${val.substring(bEnd, val.length).trim()}`;
        clearAutocomplete(this);
        textArea.focus();
        textArea.selectionStart = bStart + insertedText.length;
        textArea.selectionEnd = textArea.selectionStart;
    }

    // Get word at caret
    function getWordAtCaret(clearCallback) {
        const [bStart, bEnd] = getWordBoundsAtPosition(textArea.value, textArea.selectionEnd);
        let wordAtCaret = textArea.value.substring(bStart, bEnd)?.trim();

        if (type === 'author') {
            if (!wordAtCaret?.startsWith('@')) {
                clearCallback();
                return undefined;
            }
            wordAtCaret = wordAtCaret.substring(1); // Remove '@' for author search
        } else if (type === 'smiley') {
            if (!wordAtCaret?.startsWith(':')) {
                clearCallback();
                return undefined;
            }
        }
        return wordAtCaret;
    }

    // Clear the selection of suggestions
    function unselectSuggestions(container) {
        container.querySelectorAll('.deboucled-suggestion.selected')
            .forEach(s => s?.classList.toggle('selected', false));
    }

    // Focus a specific suggestion
    function focusTableChild(element) {
        if (!element) return;
        element.focus();
        element.classList.toggle('selected', true);
    }

    const getFocusedChild = (table) => table.querySelector('.deboucled-suggestion.selected');

    // Handle input event for both author and smiley suggestions
    textArea.addEventListener('input', async () => {
        const autocompleteTable = autocompleteElement.querySelector('.autocomplete-jv-list');
        if (!autocompleteTable) return;

        let risibank;
        if (textArea.id === 'message_topic') {
            risibank = document.querySelector('#risibank-container');
        }

        autocompleteTable.onclick = autocompleteOnClick;

        const clearCallback = () => clearAutocomplete(autocompleteTable);

        const wordAtCaret = getWordAtCaret(clearCallback);
        if (!wordAtCaret?.length) { clearCallback(); return; }

        let suggestions;
        if (type === 'author') {
            suggestions = await suggestAuthors(wordAtCaret);
        } else if (type === 'smiley') {
            suggestions = await suggestSmiley(wordAtCaret);
            if (suggestions?.length && suggestions.some(s => wordAtCaret === s[0])) {
                clearCallback(); // Close the suggestion box if an exact match is found
                return;
            }
        }

        if (!suggestions?.length) { clearCallback(); return; }

        // Create suggestions list
        autocompleteTable.innerHTML = suggestions.map(s => {
            if (type === 'smiley') {
                return `<li class="deboucled-suggestion">${getFullSmileyImgHtml(s[0], true)} &nbsp;  ${s[0]}</li>`;
            } else {
                return `<li class="deboucled-suggestion">${s}</li>`;
            }
        }).join('');

        autocompleteTable.querySelectorAll('.deboucled-suggestion')
            .forEach(s => s.onpointerover = () => {
                unselectSuggestions(autocompleteTable);
                focusTableChild(s);
            });

        // Position the suggestions box
        let caret = getCaretCoordinates(textArea, textArea.selectionEnd);
        let sLeft = `left:${caret.left + 5}px !important;`;
        let addSize = toolbar ? toolbar.scrollHeight + 15 : 50;
        if (risibank) addSize += risibank.scrollHeight;
        let sTop = `top:${caret.top + addSize}px !important;`;
        let sWidth = 'width: auto !important;';

        // Apply the positioning styles
        autocompleteElement.style = `${sLeft} ${sTop} ${sWidth}`;
        autocompleteElement.classList.toggle('on', true);

        if (!getFocusedChild(autocompleteTable)) focusTableChild(autocompleteTable.firstElementChild);
    });

    // Handle keyboard navigation
    textArea.addEventListener('keydown', (e) => {
        if (!autocompleteElement.classList.contains('on')) return;

        const autocompleteTable = autocompleteElement.querySelector('.autocomplete-jv-list');
        if (!autocompleteTable) return;

        let focusedChild = getFocusedChild(autocompleteTable);

        switch (e.key) {
            case 'Enter':
            case 'Tab':
                if (focusedChild) focusedChild.click();
                e.preventDefault();
                break;
            case 'ArrowDown':
                unselectSuggestions(autocompleteTable);
                if (focusedChild) focusTableChild(focusedChild.nextElementSibling);
                else focusTableChild(autocompleteTable.firstElementChild);
                e.preventDefault();
                break;
            case 'ArrowUp':
                unselectSuggestions(autocompleteTable);
                if (focusedChild) focusTableChild(focusedChild.previousElementSibling);
                else focusTableChild(autocompleteTable.lastElementChild);
                e.preventDefault();
                break;
        }
    });

    // Handle touch events
    autocompleteElement.addEventListener('touchmove', (e) => {
        if (!autocompleteElement.classList.contains('on')) return;
        const autocompleteTable = autocompleteElement.querySelector('.autocomplete-jv-list');
        if (!autocompleteTable) return;
        unselectSuggestions(autocompleteTable);
        focusTableChild(e.target);
    });
}

// Wrapper function to add both author and smiley suggestion events
function addAuthorSuggestionEvent(element) {
    addSuggestionEvent('author', element);
}

function addSmileySuggestionEvent(element) {
    addSuggestionEvent('smiley', element);
}

function addSuggestions(element = null) {
    addAuthorSuggestionEvent(element);
    addSmileySuggestionEvent(element);
}

// paste image noelshack
function addPasteAndDropEvents() {
    const textArea = document.querySelector('#message_topic');
    const textAreaMP = document.querySelector('textarea#message');
    textArea?.addEventListener('drop', handleDrop);
    textArea?.addEventListener('paste', handlePaste);
    textAreaMP?.addEventListener('drop', handleDrop);
    textAreaMP?.addEventListener('paste', handlePaste);
}

document.querySelector('.picto-msg-crayon')?.addEventListener('click', () => {
    setTimeout(() => {
        document.querySelectorAll('textarea[name="text_commentaire"]').forEach(function (el) {
            el.addEventListener('paste', handlePaste);
            el.addEventListener('drop', handleDrop);
            addSuggestions(el);
        });
    }, 100);
});

async function handleDrop(event) {
    const dataTransfer = event.dataTransfer;
    if (dataTransfer.types && Array.from(dataTransfer.types).includes('Files')) {
        event.preventDefault();
        event.stopPropagation();
        const files = dataTransfer.files;
        await uploadFiles(files, event.target);
    }
}

async function handlePaste(event) {
    const clipboardData = event.clipboardData;
    if (clipboardData.types.includes('Files')) {
        event.preventDefault();
        const files = clipboardData.files;
        await uploadFiles(files, event.target);
    }
}

async function uploadFiles(files, element) {
    for (let i = 0; i < files.length; i++) {
        let file = files[i];
        if (file.type.includes("image")) {
            if (file.type === "image/webp" || file.type == "image/avif" ) {
                file = await convertToJPEG(file);
            }
            const imageUrl = await uploadFile(file);
            if (imageUrl) {
                updateTextArea(imageUrl, element);
            }
            await new Promise(resolve => setTimeout(resolve, 200));
            if (i >= 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('publication', '0');
    formData.append('domain', 'https://www.jeuxvideo.com');
    formData.append('fichier', file);

    const response = await sendImageToNoelshack(formData);

    try {
        const data = JSON.parse(response.responseText);
        return data.url || null;
    } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
    }
}

function updateTextArea(imageUrl, element) {
    imageUrl = " " + imageUrl + " ";
    const position = element.selectionStart;
    const before = element.value.substring(0, position);
    const after = element.value.substring(position, element.value.length);
    element.value = before + imageUrl + after;
    element.selectionStart = element.selectionEnd = position + imageUrl.length;
    const changeEvent = new Event('change', { bubbles: true });
    element.dispatchEvent(changeEvent);
}

async function convertToJPEG(webpBlob) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(webpBlob);

    return new Promise((resolve) => {
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;

            ctx.drawImage(img, 0, 0, img.width, img.height);
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/jpeg');
        };
    });
}

function sendImageToNoelshack(formData) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: 'https://www.noelshack.com/webservice/envoi.json',
            data: formData,
            onload: function(response) {
                resolve(response);
            },
            onerror: function(error) {
                console.error(error);
                reject(error);
            }
        });
    });
}

