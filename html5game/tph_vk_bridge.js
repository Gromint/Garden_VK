// Асинхронная загрузка SDK VK Bridge
(function (d) {
	console.log('VK SDK start load script');
	let t = d.getElementsByTagName('script')[0];
	let s = d.createElement('script');
	s.src = 'https://unpkg.com/@vkontakte/vk-bridge/dist/browser.min.js';
	s.async = true;
	t.parentNode.insertBefore(s, t);
	s.onload = js_vk_init; 
})(document);

var VKBridgeGMS = {
	_mapTypeDesc: "VKBridge",
	_request_id: 100,
	_is_init: false,

	newRequest: function () {
		return ++this._request_id;
	},

	/**
	 * Исправленная отправка: гарантируем, что event и data — это всегда строки.
	 */
	send: function (request_id, event, data = null) {
		if (window.GMS_API && window.GMS_API.send_async_event_social) {
			var map = {
				"type": String(this._mapTypeDesc),
				"request_id": String(request_id),
				"event": String(event) // Принудительно в строку, чтобы избежать undefined в GML
			};
			
			// Если данных нет, отправляем пустую строку, чтобы json_parse не падал
			if (data === null || typeof data === 'undefined') {
				map["data"] = "";
			} else {
				map["data"] = (typeof data === 'object') ? JSON.stringify(data) : String(data);
			}
			
			window.GMS_API.send_async_event_social(map);
		}
	},

	sendError: function (request_id, event, error) {
		console.error("VK Bridge Error [" + event + "]:", error);
		// Передаем текст ошибки как данные
		this.send(request_id, event, error ? String(error) : "Unknown Error");
	}
};

function js_vk_init() {
	if (typeof vkBridge !== 'undefined') {
		vkBridge.send('VKWebAppInit')
			.then(data => {
				VKBridgeGMS._is_init = true;
				VKBridgeGMS.send(-1, "initSuccess");
			})
			.catch(error => {
				VKBridgeGMS.sendError(-1, "initError", error);
			});
	}
	return 1;
}

/**
 * Получение статуса инициализации
 * Исправлено название на js_vk_get_init_status
 */
function js_vk_get_init_status() {
	return VKBridgeGMS._is_init ? 1 : 0;
}

function js_vk_show_ads() {
    let self = VKBridgeGMS;
    let req_id = self.newRequest();
    vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'interstitial' })
        .then(data => {
            // ВК вернул результат. Даже если рекламу пропустили, это успех закрытия.
            self.send(req_id, "adClosed", data);
        })
        .catch(error => {
            self.sendError(req_id, "adError", error);
        });
    return String(req_id); // Возвращаем String, так как в Extension стоит String
}

function js_vk_show_rewarded_ads() {
	let self = VKBridgeGMS;
	let req_id = self.newRequest();

	vkBridge.send('VKWebAppShowNativeAds', { ad_format: 'reward' })
		.then(data => {
			if (data.result) {
				// Игрок досмотрел рекламу до конца
				self.send(req_id, "rewardedReceived");
			} else {
				// Реклама не загрузилась или вернула false
				self.sendError(req_id, "rewardedError", "failed");
			}
		})
		.catch(error => {
			// Игрок закрыл рекламу раньше времени или произошла сетевая ошибка
			self.sendError(req_id, "rewardedError", error);
		});

	return String(req_id);
}

function js_vk_save_data(key, value) {
	// ЗАЩИТА: Если GameMaker паникует и пытается сохранить пустой файл до загрузки ВК
	if (typeof vkBridge === 'undefined') {
		console.warn("VK Bridge is undefined. Save request deferred.");
		return "0";
	}

	let self = VKBridgeGMS;
	let req_id = self.newRequest();
	vkBridge.send('VKWebAppStorageSet', {
		key: String(key),
		value: String(value)
	})
	.then(data => {
		self.send(req_id, "saveSuccess", key);
	})
	.catch(error => {
		self.sendError(req_id, "saveError", error);
	});
	return String(req_id);
}

/**
 * Исправленная загрузка: четкое разделение Success и Empty.
 */
function js_vk_get_data(key) {
	// ЗАЩИТА: На случай если вызов произошел до инициализации
	if (typeof vkBridge === 'undefined') {
		console.warn("VK Bridge is undefined. Get request ignored.");
		let self = VKBridgeGMS;
		let req_id = self.newRequest();
		// Сразу возвращаем, что облако пустое, чтобы игра не висла
		setTimeout(() => self.send(req_id, "getDataEmpty", ""), 1);
		return String(req_id);
	}

	let self = VKBridgeGMS;
	let req_id = self.newRequest();
	vkBridge.send('VKWebAppStorageGet', {
		keys: [String(key)]
	})
	.then(data => {
		// Проверяем, что массив ключей существует и значение не является пустой строкой/null
		if (data.keys && data.keys[0] && data.keys[0].value !== "" && data.keys[0].value !== null) {
			self.send(req_id, "getDataSuccess", data.keys[0].value);
		} else {
			// Если данных нет, отправляем getDataEmpty с пустой строкой
			// В твоем GML это попадет в switch, но save_data не изменится
			self.send(req_id, "getDataEmpty", "");
		}
	})
	.catch(error => {
		self.sendError(req_id, "getDataError", error);
	});
	return String(req_id);
}

function js_vk_show_leaderboard(score) {
    let self = VKBridgeGMS;
    let req_id = self.newRequest();
    
    // Преобразуем в число на случай, если из GML пришла строка
    let finalScore = parseInt(score); 

    vkBridge.send('VKWebAppShowLeaderBoardBox', { 
        user_result: finalScore 
    })
    .then(data => {
        self.send(req_id, "leaderboardClosed", data);
    })
    .catch(error => {
        // Выведи ошибку в консоль целиком, чтобы увидеть код ошибки
        console.error("Full VK Error:", error);
        self.sendError(req_id, "leaderboardError", error);
    });
    return String(req_id);
}

function js_vk_check_and_add_favorite() {
    vkBridge.send('VKWebAppGetConfig')
        .then(data => {
            // Если игры еще нет в избранном (левом меню)
            if (!data.is_favorite) {
                vkBridge.send('VKWebAppAddToFavorites')
                    .then(res => { console.log("VK: Favorite window shown"); })
                    .catch(err => { console.error("VK: Favorite prompt failed", err); });
            } else {
                console.log("VK: Game is already in favorites, skipping prompt.");
            }
        })
        .catch(error => {
            console.error("VK: Config check failed", error);
        });
    return 1;
}