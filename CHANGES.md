# 鏇存柊鏃ュ織 / Changelog

## 涓枃

#### v2.2.0 (2026-07-07)

**设置页重构与体验修复**
- 设置页重构：合并对话/图像/视频三个 API 配置页为统一的「模型配对」页面，按轨道（对话/图像/视频）各自选择 Provider + 模型
- 删除冗余的 API 工作台（ProviderWorkbench）组件，Provider 选择统一使用下拉框+模型输入框
- 网关预设精简：从 4 个减为 3 个，移除 cpa-compatible
- 修复 ChatPanel 原生 select 下拉被左侧栏遮挡的白条问题，改用自定义 ChipSelect 弹出式下拉
- 图像/视频生成错误卡片新增「重新生成」按钮，点击后复用原 prompt 和参数重试
- 新增 `useChat.retryErroredTask` 错误重试机制
- 开发模式代理绕过：主进程添加 `proxy-bypass-list` 避免系统代理干扰 localhost 开发服务器

#### v2.1.9 (2026-07-07)

**Startup hotfix**
- Fixed the 2.1.8 packaged startup crash caused by a shared model-capability helper not being included in `app.asar`.
- Added release/runtime checks so missing packaged runtime files fail before shipping.
- Rebuilt the Windows release set so the installer, blockmap, `latest.yml`, and `SHA256SUMS.txt` are generated together.

#### v2.1.8 (2026-07-06)

**Relay image generation compatibility**
- Added stronger New API / One API, sub2api, and CPA-compatible relay handling for image models such as `gpt-image-2`, `image2`, `nano-banana2`, and Gemini image aliases.
- Added image-model capability classification so image setup prioritizes generation-capable models while keeping manual model entry available.
- Expanded relay image response handling for URL, base64, Gemini inline data, and asynchronous task-style image results.
- Preserved the subscription/API-key/gateway setup boundary: subscription entries remain non-callable unless a provider offers an official OAuth/API token flow.

#### v2.1.7 (2026-07-06)

**Release asset consistency**
- Rebuilt and republished the Windows installer as a new version so the installer, blockmap, `latest.yml`, and `SHA256SUMS.txt` are generated from the same release set.
- Kept the existing `v2.1.6` GitHub Release unchanged to avoid same-version binary drift.

#### v2.1.6 (2026-07-06)

**Provider/API configuration cleanup**
- Reworked Provider setup around a canonical `providerAccounts` credential pool with separate chat, image, and video runtime bindings.
- Added Hermes-style account, API key, and OpenAI-compatible gateway configuration flows while keeping OAuth entries as non-callable placeholders.
- Moved credential resolution back into the main process, including account track checks so chat-only accounts cannot be reused for image or video calls.
- Preserved legacy provider/profile compatibility during migration while removing duplicated secret copies from runtime provider payloads.
- Fixed gateway model defaults and model-fetch/test paths so chat and image bindings use the correct provider definitions, account IDs, and manual fallback behavior.
- Expanded core regression coverage for migration, redacted secret preservation, account resolver boundaries, OAuth blocking, and gateway image defaults.

#### v2.1.5 (2026-07-05)

**Startup hotfix**
- Fixed the 2.1.4 startup crash caused by the renderer calling `normalizeConversationRecord()` without importing it.
- Added a focused entrypoint unresolved-reference check to `npm run test:core` so missing imports in high-risk JS entrypoints fail before release.
- Added a Windows packaged smoke check for `release/win-unpacked/Gravuresse.exe` to catch startup `ReferenceError`, `Uncaught`, and ErrorBoundary failures before publishing.

#### v2.1.4 (2026-07-05)

**Release hardening**
- Added Chinese review text for chat-created image/video tasks so users confirm the creative brief before providers receive the English execution prompt.
- Routed remote media previews through a main-process HTTPS cache with MIME sniffing, private-host blocking, and a restricted local protocol.
- Hardened config, import, store, provider template, media URL, Markdown link, and generation metadata boundaries against inherited fields and unsafe URLs.
- Added release SHA256 checksum generation and expanded core regression coverage for sanitizer, preview cache, task review text, and custom provider templates.

#### v2.1.3 (2026-07-04)

**TypeScript boundary and IPC cleanup**
- Added a gradual TypeScript baseline with shared domain and renderer Electron API types.
- Split conversation, provider, asset, and shell IPC registration out of the main process entry while preserving channel names and behavior.
- Tightened provider and asset IPC shape checks so invalid renderer payloads fail with controlled errors instead of TypeError paths.
- Added IPC registration regression tests, expanded typecheck coverage for the current migration chain, rebuilt the Windows package, and updated the title-bar version to `v2.1.3`.

#### v2.1.2 (2026-07-03)

**Security and architecture cleanup**
- Fixed provider HTTP redirect handling so API credentials are never replayed to cross-origin redirect targets, and cross-origin redirects are rejected before DNS lookup.
- Consolidated provider calls through the unified pipeline while keeping legacy IPC channels functional as compatibility wrappers.
- Added shared media URL sanitizer fixtures for main and renderer, expanded redirect regression tests, and split low-risk IPC/provider/conversation helper modules.
- Rebuilt the Windows package and updated the title-bar version to `v2.1.2`.

#### v2.1.1 (2026-07-03)

**Security hardening and release refresh**
- Hardened imported project media URLs so unsafe `file:`, `http:`, localhost, private-address, and mismatched data URLs are cleared while keeping asset records.
- Tightened image provider testing so saved credentials only use saved endpoint/template configuration; temporary renderer templates require freshly typed credentials.
- Strengthened production CSP, enabled release signing when certificate environment variables are available, and updated the title-bar version to `v2.1.1`.
- Rebuilt the Windows package and added regression tests for URL sanitization, legacy asset lineage preservation, and provider test credential handling.

#### v2.1.0 (2026-07-03)

**Provider API setup and release cleanup**
- Updated the title-bar version badge to read from `package.json` so the UI no longer shows the stale `v1.8.0`.
- Expanded Provider-first API configuration across chat/image/video with selectable providers, saved profiles, credential modes, model fetching, manual model fallback, and provider billing/reference states.
- Added custom image/video API templates, template presets, template path readiness checks, and automatic safe presets for fal, Replicate, and Custom Video.
- Improved model fetching for versioned API base URLs, Gemini endpoints, custom model-list paths, redacted errors, and non-standard endpoint fallback.
- Hardened template validation, custom auth handling, provider/profile switching, saved credential reuse, and video polling session persistence.
- Added core tests for provider normalization, model fetching, auth resolution, custom templates, asset lineage, and import compatibility.

#### v2.0.1 (2026-07-01)

**鍥剧墖 API 閰嶇疆涓庝腑杞珯婕旂ず**
- 鏂板鈥滀腑杞珯 / GPT Image 2鈥濅綔涓哄浘鐗?API 涓诲叆鍙ｏ紝榛樿浣跨敤 `gpt-image-2` 涓?OpenAI Images 鍏煎璺緞
- API 閰嶇疆椤垫寜 Hermes Agent 鐨?Provider-first 妯″紡閲嶆帓锛氬厛涓嬫媺閫夋嫨渚涘簲鍟嗭紝鍐嶉€夋嫨璁よ瘉鏂瑰紡銆佸～鍐欏嚟璇併€佹媺鍙栧苟閫夋嫨妯″瀷
- API 閰嶇疆椤垫柊澧炲凡淇濆瓨妯″瀷閰嶇疆涓嬫媺锛屽彲鐩存帴鍒囨崲鍘嗗彶 Provider + 鍑瘉 + Base URL + Model 缁勫悎
- Provider 涓嬫媺鍙睍绀哄彲鐩存帴璋冪敤鐨?API 渚涘簲鍟嗭紱璁㈤槄/璧勬枡鍏ュ彛淇濈暀涓哄崱鐗囪鏄庡拰璐拱/鐧诲綍閾炬帴锛岄伩鍏嶈淇濆瓨涓轰笉鍙皟鐢ㄩ厤缃?- 鍥剧墖閰嶇疆椤电畝鍖栦负 Provider銆佽璇佹柟寮忋€丄PI Key/Session Token銆佷腑杞珯 Base URL銆佹ā鍨嬩笌娴嬭瘯鐢熷浘锛涘畼鏂?Provider 鐨?Base URL 绉诲叆楂樼骇閫夐」
- 妯″瀷鍖烘柊澧炲埛鏂版寜閽紝鑷姩鎷夊彇澶辫触鎴栧垰鏀瑰畬閰嶇疆鏃跺彲鎵嬪姩閲嶆柊鑾峰彇妯″瀷鍒楄〃
- 鏂板鍥剧墖鐪熷疄鐢熸垚娴嬭瘯锛屼娇鐢ㄦ渶灏忔祴璇?prompt 杩斿洖缂╃暐鍥撅紝閬垮厤鍙潬妯″瀷鍒楄〃璇垽鍙敤鎬?- Chat / Image / Video 鎵€鏈夊凡閰嶇疆 Provider 閮戒細灏濊瘯鑷姩鎷夊彇妯″瀷鍒楄〃锛涒€滄祴璇曡繛鎺モ€濈粺涓€灞曠ず妯″瀷鎷夊彇缁撴灉锛岃嚜瀹氫箟鍥剧墖/瑙嗛鍏ュ彛涓嶅啀闇€瑕佹墜鍔ㄧ粫杩?- 妯″瀷鎷夊彇澶嶇敤 Provider 鑷韩鐨?Bearer銆丠eader銆丵uery銆丼ession 涓庢棤閴存潈閰嶇疆锛屼笉鍐嶅彧鎸変腑杞珯鎴?Bearer Key 澶勭悊
- 淇濆瓨鍚庣殑鑴辨晱鍑瘉銆侀潪 Bearer 閴存潈涓庢棤閴存潈 Provider 浼氬湪妯″瀷鎷夊彇銆佽繛鎺ユ祴璇曘€佺湡瀹炵敓鎴愬拰蹇嵎妯″瀷鍒囨崲涓娇鐢ㄥ悓涓€濂楀垽鏂紝閬垮厤璁剧疆椤垫樉绀哄彲鐢ㄤ絾鐢熸垚鏃惰璇嫤
- 鐪熷疄 Provider 璋冪敤涓庡仴搴锋鏌ョ幇鍦ㄤ篃鏀寔鑷畾涔?`authType/customAuth` 瑕嗙洊鍜屾棤閴存潈 Provider锛岄伩鍏嶆ā鍨嬭兘鎷変絾鐢熸垚鏃朵粛鎸?Bearer 鍙戦€?- 鑷畾涔夊浘鐗?瑙嗛 API 鐨勮璇佹柟寮忚ˉ榻?Query Key 閫夐」锛屽苟鍦?fallback Provider 鍒楄〃涓繚鐣欏畬鏁撮壌鏉冮€夐」
- 缂洪厤缃彁绀烘敼涓?Provider / 鍑瘉 / 妯″瀷锛屼笉鍐嶆妸鎵€鏈夐壌鏉冮兘鎻忚堪鎴?API Key锛涘揩鎹锋ā鍨嬫寜閽湪褰撳墠閰嶇疆鏈尮閰嶅巻鍙?profile 鏃舵樉绀哄綋鍓嶆ā鍨嬶紝閬垮厤璇涓虹涓€鏉″巻鍙查厤缃?- 蹇嵎鍒囨崲淇濆瓨杩囩殑 Provider profile 鍚庯紝涓昏繘绋嬭皟鐢ㄤ細浼樺厛鍖归厤宸蹭繚瀛?profile 鍑瘉锛岄伩鍏嶄繚瀛樿惤鐩樺墠鐭殏璋冪敤鏃?Provider锛涘巻鍙?metadata/璁㈤槄 profile 涓嶅啀鍑虹幇鍦ㄥ揩鎹峰垏鎹㈡垨 saved profile 涓嬫媺涓?- 鍚屼竴 Provider 涓嬪垏鎹笉鍚?Base URL/妯″瀷 profile 鏃讹紝涓昏繘绋嬩篃浼氬尮閰嶅搴斿凡淇濆瓨 profile锛岄伩鍏嶅揩鍒囧悗鐭殏浣跨敤鏃х鐐规垨鏃фā鍨?- 璁剧疆椤甸€夋嫨宸蹭繚瀛?profile 鍚庯紝鑷姩鎷夊彇妯″瀷涓庤繛鎺ユ祴璇曚篃浼氫粠瀵瑰簲 profile 鍥炲彇鑴辨晱鍑瘉锛屼笉鍐嶅彧渚濊禆褰撳墠 active provider
- Chat / Image / Video 鐨勬墍鏈夊彲鎵ц Provider 閮戒細鍦ㄥ綋鍓嶉厤缃尯鐩存帴灞曠ず Base URL 涓庢ā鍨嬫媺鍙栧叆鍙ｏ紝涓嶅啀鍙妸涓浆绔欏綋浣滃彲閰嶇疆 API
- 璁剧疆椤典笉鍐嶇敤涓绘祦 Provider 鐧藉悕鍗曢殣钘?registry/fallback 涓殑鍏跺畠 API锛涚櫧鍚嶅崟鍙繚鐣欎负鎺掑簭鏉冮噸锛岄伩鍏嶆柊澧?Provider 宸叉敞鍐屽嵈鏃犳硶閫夋嫨
- 妯″瀷鎷夊彇浼氳瘑鍒畼鏂?API 宸插寘鍚増鏈矾寰勭殑 Base URL锛堜緥濡?`/v1`銆乣/v1beta`銆乣/api/v3`锛夛紝閬垮厤鎶婄伀灞辩瓑瀹樻柟绔偣閿欒鎷兼垚閲嶅鐗堟湰璺緞
- Gemini 妯″瀷鎷夊彇浼氳瘑鍒敤鎴峰～鍐欑殑 `/v1beta` 绔偣锛屼笉鍐嶉噸澶嶆嫾鎺?`/v1beta/v1beta/models`
- 妯″瀷閰嶇疆鍦ㄤ笅鎷夐€夋嫨涔嬪濮嬬粓淇濈暀鎵嬪姩杈撳叆妗嗭紝鍦ㄧ嚎鍒楄〃鎴栧唴缃洰褰曟病鏈夎鐩栫殑鏂版ā鍨嬩篃鑳界洿鎺ュ～鍐?- 鑷姩/鎵嬪姩鎷夊彇妯″瀷鍚庝細鏄剧ず鎷夊彇缁撴灉銆佺┖鍒楄〃鎻愮ず鎴栧け璐ユ彁绀猴紝涓嶅啀闈欓粯娓呯┖妯″瀷鍒楄〃
- 璁剧疆椤典富鍔ㄦ媺鍙栨ā鍨嬫垨娴嬭瘯杩炴帴鏃朵細鏄剧ず Provider 杩斿洖鐨勮劚鏁忛敊璇紝涓嶅啀鎶?Key銆丅ase URL 鎴栫鐐归敊璇吉瑁呮垚绌烘ā鍨嬪垪琛?- Provider 涓嶆彁渚涙爣鍑嗘ā鍨嬪垪琛ㄦ帴鍙ｆ椂浼氶檷绾т负鎺ㄨ崘妯″瀷/鎵嬪姩杈撳叆鎻愮ず锛屼笉鍐嶆妸 404/405 璇垽涓哄嚟璇佷笉鍙敤
- Provider 榛樿妯″瀷涓虹┖浣嗗唴缃洰褰曟湁鎺ㄨ崘椤规椂锛岄€夋嫨 Provider 浼氳嚜鍔ㄥ啓鍏ョ涓€鏉℃帹鑽愭ā鍨嬶紝閬垮厤涓嬫媺鍙浣嗕繚瀛橀厤缃负绌?- 鏃ч厤缃垨淇濆瓨 profile 鏃朵篃浼氱敤 Provider 鎺ㄨ崘妯″瀷琛ラ綈绌烘ā鍨嬶紝閬垮厤閲嶅惎鍚庡揩鎹锋ā鍨嬪垏鎹㈡紡鎺夎閰嶇疆
- 淇濆瓨璁剧疆鍓嶄細鍐嶆褰掍竴鍖栧綋鍓?Provider 鐨勭┖妯″瀷锛岄伩鍏嶇晫闈㈡樉绀烘帹鑽愭ā鍨嬩絾 active provider 钀界洏涓虹┖
- 鑷畾涔?API 澧炲姞妯″瀷鍒楄〃璺緞閰嶇疆锛岃嚜鍔ㄦ媺鍙栨ā鍨嬪彲閫傞厤 `/api/models`銆乣/v1/model/list` 绛夐潪鏍囧噯绔偣锛屽苟闄愬埗涓虹浉瀵硅矾寰勯伩鍏嶇粫杩?Base URL
- 鑷畾涔夊浘鐗?瑙嗛 API 楂樼骇閰嶇疆鏂板璇锋眰鏂规硶涓?JSON Body 妯℃澘锛屽彲鐩存帴閫傞厤闈炴爣鍑嗙敓鎴愩€佹彁浜ゅ拰杞鎺ュ彛锛屼笉鍐嶉渶瑕佹敼浠ｇ爜
- 鏆傛棤鍘熺敓 handler 鐨勫浘鐗?瑙嗛 API Provider 鐜板湪鍙綔涓衡€滆嚜瀹氫箟 API鈥濋厤缃細閫夋嫨 Provider 鍚庡～鍐欓珮绾ц矾寰勪笌妯℃澘鍗冲彲璧伴€氱敤 custom pipeline
- 娓叉煋绔?fallback Provider 鍒楄〃涔熶細鎶婂獟浣?API metadata 鍏ュ彛褰掍竴鍖栦负妯℃澘鍨嬭嚜瀹氫箟 API锛岄伩鍏嶄富杩涚▼鍒楄〃涓嶅彲鐢ㄦ椂涓嬫媺鑳藉姏閫€鍖?- 鑷畾涔夊浘鐗囪姹傛ā鏉跨幇鍦ㄤ紭鍏堜娇鐢ㄨ缃〉鍐欏叆鐨?`requestBody`锛屽苟鍦ㄧ紪杈戞椂娓呯悊鏃?`body/submitBody` 鍒悕锛岄伩鍏嶅巻鍙查厤缃鐩栨柊妯℃澘
- 鍒囨崲 Provider 鏃朵細娓呯悊鏃?Provider 鐨勯珮绾фā鏉裤€佽矾寰勩€佹柟娉曘€丅ody銆佽疆璇笌妯″瀷鍒楄〃璺緞锛岄伩鍏嶆柊渚涘簲鍟嗚鐢ㄤ笂涓€濂?API 閰嶇疆
- 鍒囨崲宸蹭繚瀛?Provider profile 涓庢竻绌洪厤缃篃澶嶇敤鍚屼竴濂楁竻鐞嗛€昏緫锛岄伩鍏嶅揩鎹锋ā鍨嬪垏鎹㈠悗娈嬬暀涓婁竴鏉?profile 鐨勯珮绾?API 瀛楁
- 鏃х増 profile 涓殑 `customTemplate`銆侀《灞傛ā鏉垮瓧娈靛拰 `modelsPath` 浼氬湪鍒囨崲/淇濆瓨鏃跺綊涓€鍖栧埌褰撳墠 `template/modelListPath` 缁撴瀯锛岄伩鍏嶅崌绾у悗涓㈠け鑷畾涔?API 閰嶇疆
- 鎵嬪姩杈撳叆鎴栧垏鎹㈡ā鍨嬫椂涓嶄細鍐嶈Е鍙戣嚜鍔ㄦ媺鍙栵紝鑷姩鎷夊彇鍙搷搴?Provider銆佸嚟璇併€佺鐐瑰拰璁よ瘉鏂瑰紡鍙樺寲
- 蹇€熷垏鎹?Provider銆佸嚟璇佹垨绔偣鏃讹紝杈冩棭杩斿洖鐨勬ā鍨嬫媺鍙栬姹備細琚拷鐣ワ紝涓嶄細瑕嗙洊褰撳墠 Provider 鐨勬ā鍨嬪垪琛?- 褰撳嚟璇佹垨绔偣琚竻绌烘椂锛屼細绔嬪嵆鍙栨秷鏃фā鍨嬫媺鍙栫粨鏋滅殑鍥炲啓骞舵竻绌哄姞杞芥€侊紝閬垮厤鏃犳晥閰嶇疆涓嬫樉绀烘棫妯″瀷
- 杩炴帴娴嬭瘯涓庢祴璇曠敓鍥句細浣跨敤褰撳墠閫夋嫨鐨勮璇佹柟寮忓拰鑷畾涔夎璇佸弬鏁帮紝涓嶅啀鍥為€€鍒?Provider 榛樿 authType
- 璁剧疆椤典繚瀛樹細绛夊緟涓昏繘绋嬮厤缃惤鐩樺畬鎴愬悗鍐嶅叧闂紝閬垮厤鍒氫繚瀛?Provider/妯″瀷鍚庣珛鍒荤敓鎴愭椂鍛戒腑鏃ч厤缃?- 璁剧疆淇濆瓨涓細绂佺敤 Escape/鍏抽棴鎿嶄綔锛屼繚瀛樺け璐ユ椂鍦ㄥ脊绐楀唴鏄剧ず閿欒锛屼笉鍐嶅彧鍐欏叆鎺у埗鍙?- Provider 鍋ュ悍妫€鏌ヤ細闄愬埗鑷畾涔?Header 鍚嶃€佹敮鎸?Query 閴存潈鍙傛暟锛屽苟鍦ㄧ敤鎴疯緭鍏ユ柊鏄庢枃鍑瘉鏃舵祴璇曞綋鍓嶈緭鍏ョ鐐癸紝鑰屼笉鏄敊璇洖钀藉埌榛樿绔偣
- 褰撳墠 Provider 閰嶇疆鍖烘柊澧?API Key銆佹帶鍒跺彴銆佸厖鍊?璐拱涓庢枃妗ｇ洿杈炬寜閽紝鍑忓皯閰嶇疆鏃跺湪鍗＄墖鍒楄〃閲屽弽澶嶅鎵惧叆鍙?- Provider 鍗＄墖涓庡綋鍓嶉厤缃尯鏂板鈥滅洿杩?API / 鑷畾涔?API / 璁㈤槄璧勬枡 / 璧勬枡鍏ュ彛鈥濊皟鐢ㄧ姸鎬佸拰鎺ュ叆鏂瑰紡鎻愮ず锛屽尯鍒嗗彲璋冪敤 API 涓庝粎璐﹀彿/璁㈤槄璇存槑
- 褰撳墠 Provider 閰嶇疆鍖烘柊澧炲氨缁鏌ワ紝閫愰」鏄剧ず鍑瘉銆佺鐐广€佹ā鍨嬫槸鍚﹂綈鍏紝骞跺彲涓€閿～鍏ユ帹鑽?Base URL 涓庢ā鍨?- 鑷姩鎷夊彇妯″瀷涓庢祴璇曡繛鎺ヤ細鍦ㄥ綋鍓?Base URL 涓虹┖鏃跺洖閫€鍒?Provider 榛樿绔偣锛屽噺灏戝垰閫変緵搴斿晢鍚庣殑鎵嬪姩閰嶇疆姝ラ
- Provider 閰嶇疆鏂板鍐呯疆妯″瀷鐩綍锛氬湪绾挎媺鍙栧け璐ユ垨 Provider 涓嶆彁渚涙爣鍑嗘ā鍨嬫帴鍙ｆ椂锛屾ā鍨嬩笅鎷変粛浼氭樉绀烘帹鑽愭ā鍨嬶紝閬垮厤鐢ㄦ埛鎵嬪姩鏌ユā鍨嬪悕
- 娓叉煋绔?fallback Provider 鍒楄〃涔熶細淇濈暀璁よ瘉鏂瑰紡銆佹ā鍨嬬洰褰曘€佽皟鐢ㄧ姸鎬佸拰鎺ュ叆鏂瑰紡锛岄伩鍏嶄富杩涚▼ Provider 鍒楄〃鍔犺浇澶辫触鏃堕€€鍥炲埌鎵嬪伐閰嶇疆
- 妯″瀷鍒楄〃杩斿洖寮傚父褰㈢姸鏃朵細琚畨鍏ㄨ涓虹┖鍒楄〃锛岄伩鍏嶈缃〉鍥犱负涓浆/Provider 杩斿洖鏍煎紡涓嶆爣鍑嗚€屽穿婧?- 鏈彇鍒版ā鍨嬪垪琛ㄤ笉鍐嶈褰撲綔 API 涓嶅彲鐢紱鐢ㄦ埛浠嶅彲鎵嬪姩杈撳叆妯″瀷锛屽苟鐢ㄦ祴璇曠敓鍥剧‘璁ょ湡瀹炵敓鎴愯兘鍔?- 鍥剧敓瑙嗛浠诲姟浼氶殢浠诲姟淇濆瓨鏉ユ簮鍥剧墖 URL锛屽苟鍦ㄦ墽琛屾椂鍥炴煡鐩爣瀵硅瘽璧勪骇锛岄伩鍏嶅垏鎹㈠璇濇垨寮傛鎵ц鏃朵涪澶辨潵婧愬浘
- Custom Image API 鏀寔 `/v1` 璺緞鍘婚噸锛岄伩鍏嶄腑杞珯 Base URL 宸插惈 `/v1` 鏃舵嫾鍑?`/v1/v1/images/generations`
- 澧炲己鍥剧墖杩斿洖瑙ｆ瀽锛屽吋瀹?`b64_json`銆乣url`銆乣image_url`銆乣images`銆乣output`銆乣result` 涓庤嚜瀹氫箟鍝嶅簲璺緞锛涘綋鍝嶅簲璺緞鎸囧悜 `b64_json/base64` 鏃朵細鑷姩杞负 data URL

#### v2.0.0 (2026-07-01)

**鍒涗綔璋辩郴涓庢暟鎹煣鎬?*
- 鏂板璧勪骇鐢熸垚璋辩郴锛氳褰?provider銆佹ā鍨嬨€乸rompt銆佸弬鏁般€佺埗璧勪骇銆佸弬鑰冭祫浜т笌浠诲姟鏉ユ簮
- 鍒囨崲/瀵煎叆鏃у璇濇椂浼氱粺涓€琛ュ叏璧勪骇缁撴瀯锛岀己灏?generation 瀛楁鐨勬棫璧勪骇涔熻兘杩涘叆鍚屼竴鏉¤凯浠ｉ摼璺?
- 瀵煎叆鏃ц祫浜ф椂浼氳嚜鍔ㄤ慨澶嶇┖ ID銆佺┖绫诲瀷鍜岀┖鏍囩锛岄伩鍏嶈氨绯诲拰閫夋嫨鐘舵€佸洜涓烘棤鏁堣祫浜ц韩浠芥柇瑁?
- 瀵煎叆浼氳嚜鍔ㄤ慨澶嶉噸澶嶈祫浜?ID锛屽苟鍏煎瀛楃涓插舰寮忕殑鏉ユ簮璧勪骇瀛楁锛岄伩鍏嶈氨绯绘槧灏勪涪澶辨垨閫夋嫨鍐茬獊
- 璧勪骇 ID銆佹潵婧?ID 涓庝换鍔?ID 浼氱粺涓€褰掍竴鍖栦负瀛楃涓诧紝鏈煡璧勪骇绫诲瀷浼氬洖閫€涓哄浘鐗囷紝鍚屾椂淇濈暀 `generation.mode` 鐨勭湡瀹炵敓鎴愭柟寮忥紝閬垮厤鏃ч」鐩垨澶栭儴瀵煎叆姹℃煋鍒涗綔璋辩郴
- 瀵煎叆浼氳繃婊ら潪瀵硅薄璧勪骇锛屽苟蹇界暐闈炲璞?generation 瀛楁锛岄伩鍏嶅潖椤圭洰鏂囦欢姹℃煋鍒涗綔妗ｆ
- 璧勪骇鏇存柊浼氭繁鍚堝苟 generation 瀛楁锛岄伩鍏嶅眬閮ㄥ洖鍐欏垎杈ㄧ巼銆佺姸鎬佹垨鍧愭爣鏃朵涪澶卞師 prompt銆佹ā鍨嬩笌鐖惰祫浜у叧绯?
- 瀵煎叆浼氳鑼冨寲娑堟伅涓庝换鍔＄粨鏋勶紝杩囨护闈炲璞℃秷鎭€佷慨澶嶉噸澶嶆秷鎭?ID锛屽苟鎶婂凡涓柇鐨勮繍琛屼腑浠诲姟鏍囪涓洪敊璇紝閬垮厤鏃ч」鐩鍏ュ悗姘镐箙杞湀
- 瀵硅瘽鏍囬鎺ㄦ柇浼氳烦杩囧潖娑堟伅鍜岀┖ user 鍐呭锛屼紭鍏堜娇鐢ㄧ涓€鏉℃湁鏁堢敤鎴锋彁绀猴紝閬垮厤瀵煎叆鍚庡嚭鐜扮┖鏍囬
- 鏈湴鍘嗗彶鍔犺浇涔熶細澶嶇敤鍚屼竴濂椾細璇濊鑼冨寲锛屾棫 store 涓殑鍧忔秷鎭€佸潖璧勪骇銆佹暟瀛?activeId/deletedIds 涓嶅啀缁曡繃瀵煎叆闃插尽
- 涓昏繘绋嬩細璇?store 涔熶細缁熶竴 conversation ID銆乤ctiveId 涓?deletedIds 涓哄瓧绗︿覆锛岄伩鍏嶆棫鏁版嵁鍦ㄥ垹闄?鎭㈠/閫変腑鐘舵€佷笂澶遍厤
- 瀵硅瘽娑堟伅銆佷换鍔＄姸鎬佷笌璧勪骇澧炲垹鏀圭殑璐︽湰閫昏緫鎶戒负绾嚱鏁帮紝骞剁撼鍏ユ牳蹇冩祴璇曡鐩?
- 瀵硅瘽璐︽湰宸ュ叿浼氬閿欓潪鏁扮粍 messages/assets锛岄伩鍏嶆棫鍧忔暟鎹Е鍙戝悓姝ュ穿婧?
- 鏂板 `npm run test:core`锛岃鐩栬祫浜х粨鏋勫綊涓€鍖栥€佹棫椤圭洰瀵煎叆鍏煎涓庨敊璇彁绀烘牸寮?

**瀵硅瘽瀵煎叆/瀵煎嚭**
- 鏂板褰撳墠瀵硅瘽瀵煎叆/瀵煎嚭 JSON锛屼繚鐣欐秷鎭€佽祫浜т笌鍒涗綔璋辩郴锛屽鍏ユ椂鍒涘缓鏂扮殑鏈湴瀵硅瘽鑰屼笉澶嶇敤澶栭儴 ID
- 瀵煎嚭瀵硅瘽鏃朵細灏介噺鎶婅繙绋嬪浘鐗?瑙嗛鍐呰仈涓?data URL锛岄檷浣庝复鏃堕摼鎺ヨ繃鏈熷鑷翠綔鍝佷涪澶辩殑椋庨櫓
- 鏂板椤圭洰绾у鍑?瀵煎叆锛屽彲涓€娆¤縼绉诲叏閮ㄥ璇濓紱瀵煎叆椤圭洰鏃朵互鏂板璇濆悎骞讹紝涓嶈鐩栨湰鍦板巻鍙?
- 瀵煎叆浼氭嫆缁濇槑鏄炬棤鏁?JSON锛屽苟鍏煎鐩存帴鐢卞璇濇暟缁勭粍鎴愮殑鏃ч」鐩枃浠?
- 瀵煎叆浼氳繃婊や笉鍚璇濆瓧娈电殑瀵硅薄锛涘鏋滄枃浠朵腑娌℃湁鍙鍏ュ璇濓紝浼氱粰鍑烘槑纭敊璇?
- 瀵煎叆/瀵煎嚭澶辫触鎻愮ず浼氭樉绀哄叿浣撻敊璇師鍥狅紝鏂逛究鍒ゆ柇鏄枃浠惰繃澶с€佹牸寮忛敊璇繕鏄啓鍏ュけ璐?

**鍒涗綔妗ｆ涓庤祫浜ф搷浣?*
- 鍒涗綔妗ｆ鏂板鐢熸垚鏂瑰紡瀛楁锛屽彲鐩存帴鏌ョ湅 text-to-image銆乮mage-to-video 绛夌湡瀹?generation mode
- 璧勪骇璇︽儏鍗囩骇涓哄垱浣滄。妗堬紝鏀寔澶嶅埗 Prompt銆佸悓绯诲垪鍙樹綋銆佹崲椋庢牸銆侀噸鏂扮敓鎴愪笌鍥剧墖杞棰?
- 閲嶆柊鐢熸垚鍥剧墖淇濈暀鍘熷鎻愮ず璇嶄笉鍙橈紝缁曡繃 LLM 鐩存帴璋冪敤鍥惧儚 API
- 鍚岀郴鍒楀彉浣撲笌鎹㈤鏍兼敼涓虹‘瀹氭€у浘鐗囦换鍔★紝涓嶅啀渚濊禆 LLM 闅忔満杩斿洖鐢熸垚浠诲姟
- 璧勪骇璇︽儏涓庡彸閿彍鍗曟柊澧炩€濈敤浣滃弬鑰冣€濓紝鍙洿鎺ユ妸璧勪骇鍔犲叆褰撳墠杈撳叆寮曠敤骞惰仛鐒﹁緭鍏ユ
- 璧勪骇璇︽儏涓庡彸閿彍鍗曟柊澧炩€濈紪杈?Prompt鈥濓紝鍙妸鍘?Prompt 濉洖杈撳叆妗嗙户缁敼鍐?
- 閫氳繃鈥濈紪杈?Prompt鈥濈户缁敓鎴愮殑鏂扮粨鏋滀細淇濈暀鐖惰祫浜у叧绯伙紝閬垮厤鍒嗗弶鍒涗綔鏂氨绯?

**绱犳潗绯荤粺**
- 璧勪骇鍙爣璁颁负涓汉绱犳潗锛岀礌鏉愪細鍦ㄥ崱鐗囦笌鍙傝€冨浘閫夋嫨鍣ㄤ腑鏍囨槦骞朵紭鍏堟樉绀?
- 鐢诲竷涓庡弬鑰冨浘閫夋嫨鍣ㄦ敮鎸佸彧鐪嬬礌鏉愶紱鍒涗綔妗ｆ涓殑鏉ユ簮璧勪骇鏀寔鎮仠棰勮
- 鏍囪绱犳潗銆佸垹闄よ祫浜т笌鑷敱鐢诲竷鎷栧姩浣嶇疆浼氬嵆鏃跺悓姝ュ埌瀵硅瘽瀛樺偍锛屽噺灏戝揩閫熷垏鎹?瀵煎嚭鏃剁殑鐘舵€佽惤鍚?

**瑙嗛鐢熸垚澧炲己**
- 鍥剧墖杞棰戜細寮哄埗鎶婂綋鍓嶅浘鐗囦綔涓鸿棰?source image锛涜棰戣祫浜т笉鍐嶆彁渚涚粫杩囪垂鐢ㄧ‘璁ょ殑閲嶆柊鐢熸垚鎹峰緞
- 浠庡浘鐗囨墽琛屸€濆仛鎴愯棰戔€濅細鑷姩鍒囧埌瑙嗛宸ヤ綔鍖猴紝璁╀换鍔￠槦鍒楀拰瀹屾垚缁撴灉淇濇寔鍙

**鐢诲竷浜や簰鍗囩骇**
- 鑷敱鐢诲竷鏂板璧勪骇绾ф挙閿€/閲嶅仛銆佸皬鍦板浘瀹氫綅涓庤氨绯荤嚎寮€鍏筹紝鎷栧姩銆佸垹闄ゃ€佹爣璁扮礌鏉愮瓑鐢ㄦ埛鎿嶄綔鍙仮澶?
- 鏂板鏈湴 Agent 鍔ㄤ綔闃熷垪锛氬熀浜庨€変腑璧勪骇寤鸿涓嬩竴姝ュ姩浣滐紝鐢ㄦ埛纭鍚庡鐢ㄧ幇鏈夎祫浜у姩浣滄墽琛?
- Agent 闃熷垪鏀寔澶嶅埗鍙鏌ュ姩浣滆鍒掞紝骞跺湪鍒囨崲璧勪骇鏃舵竻鐞嗚繃鏈熷姩浣滐紝閬垮厤璇墽琛屾棫璧勪骇璁″垝

**鍥介檯鍖栦笌璁剧疆**
- 閲嶆柊鐢熸垚銆佺紪杈?Prompt銆佸浘鐗囪浆瑙嗛涓?Provider 棰勬閿欒浼氳窡闅忓綋鍓嶈瑷€鏄剧ず锛屽噺灏戣嫳鏂囩晫闈腑鐨勪腑鏂囩‖缂栫爜
- API 閰嶇疆瀛楁锛圞ey/URL/Model锛夌Щ鑷?Provider 鍗＄墖缃戞牸涓婃柟锛屾棤闇€婊氬埌搴曢儴
- 璁㈤槄/濂楅绫?Provider 鐐瑰嚮鏄剧ず璧勬枡鍗＄墖锛堝畼缃?鏂囨。/璐拱鍏ュ彛锛夛紝涓嶈鍐欏叆璋冪敤閰嶇疆
- 娓呯悊杩囨椂鐨勭粺涓€ API 椤甸潰浠ｇ爜涓庨噸澶?Provider 閫夋嫨鍏ュ彛

#### v1.9.0 (2026-06-29)

**宸ヤ綔鍖轰笌妯″瀷鍏ュ彛閲嶆瀯**
- 榛樿杩涘叆鐢熷浘宸ヤ綔鍖猴紝鐙珛瀵硅瘽鍏ュ彛绉婚櫎锛屼絾淇濈暀鍏变韩瀵硅瘽闈㈡澘涓庡瀵硅瘽鍘嗗彶
- 妯″瀷閫夋嫨鍏ュ彛绉诲叆瀵硅瘽妗嗗伐鍏锋潯锛屽彧鏄剧ず璁剧疆涓繚瀛樿繃鐨勫璇濇ā鍨嬩笌褰撳墠濯掍綋妯″瀷
- 鐢诲竷鎸夊綋鍓嶅伐浣滃尯鑷姩杩囨护鍥剧墖/瑙嗛璧勪骇锛岀Щ闄ら噸澶嶇殑鍏ㄩ儴/鍥剧墖/瑙嗛绛涢€?
- OpenNana 鎻愮ず璇嶅簱鍏ュ彛绉诲埌鐢诲竷缃戞牸/鑷敱鍒囨崲鏃?

**API 璁剧疆涓?Provider 姊崇悊**
- 璁剧疆椤?API 閰嶇疆鏀逛负瀵硅瘽/鍥惧儚/瑙嗛涓夋爮鐩紝瑙嗛鏍忕洰璺熼殢瀹為獙瑙嗛寮€鍏虫樉绀?
- Provider 鍒楄〃绮剧畝涓轰富娴佸彲鐢ㄩ」锛屽苟鎸夋寜閲忎粯璐逛笌璁㈤槄/濂楅鍒嗗尯
- 鐏北鏂硅垷 Coding Plan 涓?OpenCode Go 瀹屽叏鎷嗗垎涓虹嫭绔嬭祫鏂欏叆鍙?
- ChatGPT Plus/Pro銆丆laude Pro/Max 绛夌綉椤佃闃呬粎浣滀负璧勬枡鍏ュ彛锛屼笉璇啓鍏ヨ皟鐢ㄩ厤缃?
- 淇鏃?provider id 杩佺Щ瀵艰嚧 API Key 琚竻绌虹殑闂

**绋冲畾鎬т笌浣撻獙淇**
- 鏂扮敤鎴烽粯璁ゆ祬鑹蹭富棰橈紝骞朵慨澶嶆繁鑹蹭富棰樹笅 select/option 涓庡急鏂囨湰鍙鎬?
- 淇棣栨鍚姩鎴栨棤 active conversation 鏃剁涓€鏉℃秷鎭棤娉曞彂閫佺殑闂
- 寮哄寲澶氬璇濆巻鍙蹭笌鍥剧墖璧勪骇鐣欏瓨锛岄伩鍏嶆仮澶嶄細璇濈涓€鏉℃秷鎭娇鐢ㄩ敊璇笂涓嬫枃
- 瑙嗛鐢熸垚榛樿闅愯棌涓哄疄楠屽姛鑳斤紝闄嶄綆楂樻垚鏈鐢ㄩ闄?

#### v1.8.0 (2026-06-25)

**Provider Profiles 鈥?澶氶厤缃垏鎹?*
- 鏂板 Provider Profiles 绯荤粺锛氭瘡涓建閬擄紙chat/image/video锛夊彲淇濆瓨澶氱粍 API Key + 妯″瀷缁勫悎
- 鏂板 `ModelSelector` 缁勪欢鏇夸唬鍘?`ModelBar`锛氬湪鑱婂ぉ闈㈡澘椤堕儴蹇€熷垏鎹㈠凡淇濆瓨鐨勬ā鍨嬮厤缃?
- 閰嶇疆鍔犲瘑瑕嗙洊 Profile 涓殑 API Key锛坄safeStorage` 鍔犲瘑锛?
- 璁剧疆椤靛ぇ骞呮墿灞曪細Profile 绠＄悊銆佹ā鍨嬫祴璇曘€佹墜鍔ㄨ緭鍏ユā鍨嬨€佹瘮渚?鍒嗚鲸鐜囬瑙?
- 鍒犻櫎妯″瀷鍘婚噸锛氶噸澶嶄繚瀛樺悓涓€ Provider+Model 缁勫悎鑷姩鍚堝苟

**UI 璋冩暣**
- 渚ф爮绮剧畝锛氱Щ闄?瀵硅瘽"妯″潡鍏ュ彛锛堣亰澶╅潰鏉垮缁堝彲瑙侊級锛岄粯璁よ繘鍏?鐢熷浘"
- 鐗堟湰鍙锋爣绛剧Щ鑷虫爣棰樻爮
- 鑱婂ぉ闈㈡澘鏍规嵁褰撳墠妯″潡锛堢敓鍥?瑙嗛锛夋樉绀哄搴旇緭鍏ユ彁绀?

#### v1.7.0 (2026-06-24)

**鍥藉唴濯掍綋 Provider 鎵╁睍**
- 鏂板闃块噷涓囩浉 / Wan锛氱敓鍥撅紙wan2.6-t2i锛? 鐢熻棰戯紙wan2.7-t2v锛夛紝寮傛浠诲姟 submit/poll handler
- 鏂板鐧惧害鍗冨竼锛氱敓鍥撅紙qwen-image锛? 鐢熻棰戯紙qianfan-video-latest锛夛紝寮傛浠诲姟 handler
- 鏂板鑵捐娣峰厓 / TokenHub锛氱敓瑙嗛锛坔y-video-1.5锛夛紝OpenAI 鍏煎 submit/query handler
- 鏂板 Vidu metadata 鍏ュ彛
- 鏂板鐏北鏂硅垷 Coding Plan / OpenCode 璧勬枡鍏ュ彛
- Custom Image/Video 鏂板鍗冨竼銆佹贩鍏冦€佷竾鐩搞€乂idu 涓浆棰勮

**UI 閲嶆瀯**
- 甯冨眬浠庣粷瀵瑰畾浣?娓愬彉缃戞牸鑳屾櫙閲嶆瀯涓?flexbox 绯荤粺
- ModelBar 绉诲埌搴曢儴鍥哄畾鏍忥紙48px锛夛紝鍏ㄥ眬鍙
- 渚ф爮鏀逛负鍥哄畾缁撴瀯锛坰idebar + 鑱婂ぉ闈㈡澘 + 鐢诲竷涓夋爮锛?
- 绉婚櫎 glass-floating 鏍峰紡锛岀粺涓€涓?elevated 鍗＄墖椋庢牸
- 璁剧疆椤垫柊澧?Coding Plan / OpenCode / 鍗虫ⅵ 閾炬帴鎸夐挳
- 鍥藉唴 Provider 鑷姩鎺掑簭缃《

**Provider 娉ㄥ唽琛ㄥ畬鍠?*
- 鐏北鏂硅垷閾炬帴鍏ㄩ潰鏇存柊涓轰腑鏂囨枃妗?
- 闃块噷涓囩浉 integrationStatus 浠?metadata 鈫?handler
- 鍚?Provider 琛ュ厖涓枃鍚嶇О鍜屽浗鍐呭弸濂介摼鎺?

#### v1.6.1 (2026-06-23)

**鏀硅繘**
- NSIS 瀹夎閫夐」锛氭敮鎸侀€夋嫨瀹夎鐩綍锛堜笉鍐嶄竴閿畨瑁咃級
- Provider ID 鍒悕鍘婚噸锛氫富杩涚▼缁熶竴浠?config.js 瀵煎叆锛屾秷闄?main.js 閲嶅瀹氫箟
- Fallback Provider 鍒楄〃鍚屾锛欳hat 浠?9 涓墿灞曞埌 15 涓紝Image 鏂板 SiliconFlow
- 绠€鍖?store.js 鍐欏叆闃熷垪锛堜笌 config.js 淇濇寔涓€鑷达級
- .gitignore 澧炲己锛氭坊鍔?OS/缂栬緫鍣?宕╂簝杞偍/瀵嗛挜鏂囦欢闃叉姢

**娓呯悊**
- 绉婚櫎杩囨椂鏂囦欢锛?codex/銆丆ODEX_TASK.md銆佹牴鐩綍娈嬫福鍥剧墖/docx

#### v1.6.0 (2026-06-21)

**Provider 鏋舵瀯閲嶆瀯**
- 缁熶竴 Provider 娉ㄥ唽琛細17 涓?Provider 鎸夊钩鍙扮粍缁囷紙openai/anthropic/google/volcengine/alibaba/moonshot/zhipu/deepseek/siliconflow/groq/together/openrouter/xai/perplexity/lingyi/runway/happyhorse锛?
- 缁熶竴 Auth 灞傦細鏀寔 bearer/header/query/cookie/session 浜旂閴存潈鏂瑰紡
- 缁熶竴 Request Pipeline锛氭墍鏈?API 璋冪敤璧?`provider:call` IPC
- 姣忎釜骞冲彴鍙０鏄庡绉嶈兘鍔涳紙chat/image/video锛夛紝涓嶅啀鎸夎建閬撴媶鍒?Provider
- 鏂板鍥藉唴骞冲彴鏀寔锛氱鍩烘祦鍔ㄣ€侀浂涓€涓囩墿銆丟roq銆乀ogether AI銆亁AI銆丳erplexity
- 搴熷純鏃х殑 electron/api/chat.js / image.js / video.js

**UI 椋庢牸鏇存柊**
- 閰嶈壊鏀逛负鍐疯皟钃濅富棰橈紙#4A6CF7锛夛紝鏇挎崲鍘熸潵鐨勯噾鑹?鐞ョ弨鑹?
- Notion 椋庢牸鎵佸钩鍖栬璁★細鍑忓皯闃村奖銆佽竟妗嗭紝澧炲姞鐣欑櫧
- 澧炲姞 `--space-*` 闂磋窛 Token 浣撶郴
- 鏆楄壊妯″紡鏀逛负娣辫摑鐏板簳锛?0D0D12锛夛紝涓嶅啀鏄殩鐏?
- 鍒嗚鲸鐜囬€夐」鏀逛负鏍囧噯鍛藉悕锛堟爣鍑?楂樻竻/瓒呮竻/2K/4K锛?
- 缁樺浘宸ュ叿鏍忎粎鍦ㄨ嚜鐢辩敾甯冩ā寮忎笅鏄剧ず

**鍏朵粬**
- 椤圭洰鏂囦欢娓呯悊锛氱Щ闄や粨搴撲腑鏃?API 鏂囦欢锛屾洿鏂?.gitignore

**瀹夊叏涓庝唬鐮佽川閲忓姞鍥?*
- **IPC 鐩戝惉鎻愬崌**锛氬皢绐楀彛鏈€灏忓寲/鏈€澶у寲/鍏抽棴鍙婄姸鎬佹煡璇㈢殑 IPC 娉ㄥ唽锛屼粠鍐呴儴杈呭姪鍑芥暟鑼冨洿鎻愬崌鑷?`electron/main.js` 妯″潡鐨勯《绾т綔鐢ㄥ煙锛屾秷闄や簡娼滃湪鐨勫唴瀛樻硠闇查殣鎮ｏ紝涓ユ牸閬靛惊 Electron 瀹夊叏瑙勮寖銆?
- **UI 鏍峰紡瑙勮寖缁熶竴**锛氬鍔犱簡閬僵鑳屾櫙鑹层€佹笎鍙樹笌鍗遍櫓杈规鐨?CSS 鍏ㄥ眬鍙橀噺锛岀Щ杩囦簡涓昏缁勪欢涓殑纭紪鐮侀鑹蹭笌杈规璁剧疆锛屽叏闈㈡浛鎹负涓婚鍙橀噺銆?
- **鍥炬爣鍖呰鍣ㄧ粺涓€**锛氬湪 `icons.jsx` 涓鍔犱簡缂哄け绐楀彛鎺т欢涓庣敾甯冨伐鍏峰浘鏍囩殑鏄犲皠锛屽皢鍚勭粍浠朵腑鎵€鏈夊師鐢?`<svg>` 鍜?direct lucide 寮曠敤鍏ㄩ儴瑙勮寖鍖栨浛鎹负 `<Ic />`銆?

**鐘舵€佷笌鐢熷懡鍛ㄦ湡淇**
- **Ref 鐘舵€佸壇浣滅敤娓呯悊**锛氱Щ闄や簡 `AssetDetail.jsx` 鐘舵€佹洿鏂板櫒鍐呴儴鐩存帴淇敼 ref 鐨勬搷浣滐紝寮曞叆浜嗕笌鍏跺悓姝ョ殑 `offsetRef` 璇诲彇鏈€鏂板亸绉婚噺锛屼繚璇佷簡 React 鐘舵€佺殑绾害銆?
- **鍗＄墖鑷敱绉诲姩绔炴€佷慨澶?*锛氬湪 `useCanvas.js` 涓柊澧?`updateAssets` 鎵归噺鏇存柊鍑芥暟锛涢噸鏋勪簡 `CanvasPanel.jsx` 鍦?Free Mode 涓嬬殑鍧愭爣鍒濆鍖栵紝灏嗗潗鏍囧垎閰嶉噰鐢ㄥ崟娆″師瀛愭壒閲忔洿鏂帮紝褰诲簳娑堥櫎浜嗙敱浜庨€愪釜鍗＄墖淇敼瀵艰嚧鐨勯『娆￠噸娓叉煋绾ц仈鍜屾棤闄愬惊鐜殣鎮ｃ€?
- **浜嬩欢鐩戝惉娉勬紡淇**锛氬湪 `CanvasPanel.jsx` 涓紩鍏?`dragCleanupRef` 涓庡嵏杞芥竻鐞?effect锛屼繚璇佸湪缁勪欢鎰忓閿€姣佹椂閲婃斁缁戝畾鍦?window 涓婄殑鎷栨嫿鐩戝惉浜嬩欢锛屾潨缁濆唴瀛樻硠闇层€?
- **i18n 缂洪櫡淇涓庝紶鎾?*锛氫慨澶嶄簡 `MessageBubble.jsx` 鎺掗槦涓笌鏌ヨ瑙嗛鐘舵€佺殑涓嫳鏂囪浆鎹?bug锛屼娇 `ContextMenu.jsx` (鍙抽敭鑿滃崟) 涓?`TaskQueue.jsx` (浠诲姟闃熷垪) 鑳藉姝ｇ‘娑堣垂 `lang` 閰嶇疆涓?`t()` 鍑芥暟缈昏瘧锛屽畬鎴愬簳鏍?model 杞ㄩ亾鐨勭炕璇戣浆鎹€?

#### v1.5.0 (2026-06-08)

**瀹夊叏鍔犲浐**
- URL 閲嶅畾鍚戝畨鍏細闃绘 HTTPS鈫扝TTP 鍗忚闄嶇骇锛岄檺鍒舵渶澶ч噸瀹氬悜娆℃暟锛屾敮鎸佺浉瀵硅矾寰?redirect
- CSP 缁熶竴绠＄悊锛氱Щ闄?index.html 涓殑 CSP meta tag锛岀敱涓昏繘绋?session header 缁熶竴鎺у埗
- API Key 鍔犲瘑瀛樺偍锛氫娇鐢?Electron safeStorage 鍔犲瘑 API Key锛岃В瀵嗗け璐ユ椂鑷姩娓呯┖閬垮厤鍙戦€佸瀮鍦炬暟鎹?
- Electron 瀵艰埅杈圭晫锛氶樆姝㈤潪搴旂敤鍐呭鑸拰 `window.open` 瀛愮獥鍙ｏ紝Markdown 澶栭摼缁熶竴璧颁富杩涚▼ HTTPS 鏍￠獙鍚?`shell.openExternal`
- 娓叉煋杩涚▼閰嶇疆鑴辨晱锛歚config:get` 鍙繑鍥?redacted API Key锛岀湡瀹炲瘑閽ヤ繚鐣欏湪涓昏繘绋嬪苟鐢?API IPC 璇诲彇
- 瀹夊叏淇濆瓨绱犳潗锛氱Щ闄ら珮椋庨櫓浠绘剰璺緞淇濆瓨鎺ュ彛锛屽浘鐗?瑙嗛淇濆瓨缁熶竴璧颁富杩涚▼鐢熸垚璺緞鎴栦繚瀛樺璇濇锛屽己鍒?`.png`/`.mp4` 鎵╁睍鍚?
- 涓嬭浇涓庡搷搴旈檺鍒讹細绱犳潗涓嬭浇澧炲姞 HTTPS 鏍￠獙銆乺edirect 澶嶆牎楠屻€?00MB 澶у皬涓婇檺銆佹€昏秴鏃跺拰涓存椂鏂囦欢 rename锛汚PI 鍝嶅簲澧炲姞 25MB 涓婇檺
- 鏂囦欢鍐欏叆鍘熷瓙鎬э細閰嶇疆鍜屽璇濇暟鎹啓鍏ヤ娇鐢?tmp+rename 鍘熷瓙妯″紡锛屽苟鍙戝啓鎿嶄綔閫氳繃闃熷垪搴忓垪鍖?
- Gemini API Key URL 缂栫爜锛氫慨澶嶅惈鐗规畩瀛楃鏃?URL 鏂鐨勯棶棰?

**鐘舵€佺鐞嗕慨澶?*
- 瀵硅瘽閲嶅懡鍚嶆寔涔呭寲锛氫慨澶嶉噸鍛藉悕鍚庡埛鏂伴〉闈涪澶辩殑 bug
- 瀵硅瘽鍒囨崲闃蹭涪锛氬垏鎹?鏂板缓/鍒犻櫎鍓?flush 褰撳墠瀵硅瘽锛屽紓姝?chat/image/video 缁撴灉鍐欏洖鍙戣捣瀵硅瘽鑰屼笉鏄涪寮冩垨涓插埌褰撳墠瀵硅瘽
- 瀵硅瘽瀛樺偍鎭㈠锛氭崯鍧忕殑 `conversations.json` 浼氬浠藉悗浠庣┖ store 鎭㈠锛屽垹闄?tombstone 鍦ㄨ鍙栧拰鍐欏叆鏃堕兘鐢熸晥
- 鐢诲竷鐘舵€佺ǔ瀹氭€э細useCanvas 杩斿洖鍊?memoization锛岄伩鍏嶇骇鑱旈噸娓叉煋
- 浠诲姟闃熷垪闂寘淇锛歶seTaskQueue 浣跨敤 canvasRef 娑堥櫎 stale closure
- 瑙嗛浠诲姟杞锛氳棰戞彁浜ゆ帴鍏ヤ换鍔￠槦鍒楋紝鎴愬姛浣嗘棤 `videoUrl` 鏃剁户缁?running锛屽畬鎴愬悗鐢熸垚 video asset
- 鍐欓槦鍒楃珵鎬佷慨澶嶏細history:save 璧扮粺涓€鍐欓槦鍒楋紝闃叉骞跺彂瑕嗙洊

**绋冲畾鎬?*
- 宕╂簝鎭㈠閫€閬匡細renderer 宕╂簝鍚?5 绉掗€€閬块噸鍚紝鏈€澶?3 娆★紝瓒呴檺鎻愮ず鎵嬪姩鎿嶄綔
- 閿欒杈圭晫锛氭柊澧?ErrorBoundary 缁勪欢锛屾覆鏌撳穿婧冩椂鏄剧ず鍙嬪ソ鎻愮ず鑰岄潪鐧藉睆
- Settings 寮圭獥 Escape 鍏抽棴銆丩ightbox Escape 鍏抽棴 + 鐐瑰嚮鑳屾櫙鍏抽棴
- 瑙嗛棰勮 CSP锛氬鍔?`media-src 'self' https: data: blob:`锛孉ssetCard/AssetDetail 浣跨敤 `<video controls>` 娓叉煋瑙嗛
- 鎵撳寘渚濊禆鍗囩骇锛欵lectron 42.3.3銆乪lectron-builder 26.15.2銆乪lectron-vite 5.0.0銆乂ite 7.3.5锛屾墦鍖呮椂澶嶅埗杩愯鏃?helper 鍜屽浘鏍囪繘 `dist`

#### v1.3.1 (2026-06-05)

**鐢诲竷鐢熸垚鍔ㄦ晥**
- 鐢熸垚鍥剧墖鏃剁敾甯冩樉绀?shimmer 鍗犱綅鍗＄墖锛屽弬鑰?Lovart 鍔ㄦ晥椋庢牸锛屾笎鍙橀棯鐑佹彁绀虹敓鎴愪腑

**澶氬浘鐢熸垚鏀寔**
- AI 杩斿洖澶氫釜鐢熸垚浠诲姟鏃讹紝鐢诲竷姝ｇ‘鏄剧ず鎵€鏈夊浘鐗囷紝涓嶅啀鍙樉绀虹涓€寮?

**鎵归噺鐢熸垚绋冲畾鎬?*
- 鎵归噺鐢熸垚涓嶅啀鍥犲崟寮犲け璐ヨ€屼腑鏂紝鍏ㄧ▼鏄剧ず鍗犱綅绗﹀拰杩涘害锛屽け璐ラ」鑷姩娓呯悊

**淇濆瓨寮圭獥淇**
- "淇濆瓨鍒版湰鍦?涓嶅啀寮瑰嚭涓ゆ瀵硅瘽妗嗭紝缁熶竴璧?IPC 閫氶亾

**宸ュ叿鏍忎氦浜掍慨澶?*
- 鐢诲竷搴曢儴缁樺浘宸ュ叿鏍忔寜閽仮澶嶆甯稿搷搴旓紝涓嶅啀琚敾甯冩嫋鎷戒簨浠舵嫤鎴?

**鍙抽敭鑿滃崟鎺ョ嚎**
- 鐢诲竷璧勪骇鍙抽敭鑿滃崟鍙甯告墦寮€锛屾敮鎸佹煡鐪嬪ぇ鍥?涓嬭浇/鍒犻櫎/閲嶆柊鐢熸垚

**瀵硅瘽鍛藉悕缂栬緫**
- 鍙屽嚮瀵硅瘽鏍囬鍙噸鍛藉悕锛屾敮鎸?Enter 纭 / Escape 鍙栨秷

**鍒嗚鲸鐜囨墿灞?*
- 鏂板 2K (2560) 鍜?4K (3840) 鍒嗚鲸鐜囬€夐」锛屽昂瀵告寜姣斾緥鍔ㄦ€佺缉鏀?

#### v1.3.0 (2026-06-04)

**瀵硅瘽鐢熸垚璁剧疆**
- 瀵硅瘽杈撳叆鏍忔柊澧炪€岀敓鎴愯缃€嶉潰鏉匡紝鍙洿鎺ヨ皟鏁村浘鐗囨瘮渚嬨€侀鏍奸璁俱€佸垎杈ㄧ巼锛堟爣鍑?楂樻竻/瓒呮竻锛?
- 鐢熸垚璁剧疆浠?Settings 绉昏嚦瀵硅瘽妗嗭紝鏂逛究闅忔椂鍒囨崲锛屾棤闇€鎵撳紑璁剧疆椤?

**鎵归噺鐢熸垚**
- 鐢熸垚浠诲姟鍗＄墖鏂板銆屾壒閲忋€嶆寜閽紝鏀寔涓€娆＄敓鎴?2/3/4 寮犲浘鐗?
- 鎵归噺杩涘害瀹炴椂鏄剧ず锛堝 2/4锛夛紝澶辫触椤硅烦杩囩户缁?

**璁℃椂鍣?*
- AI 鎬濊€冨拰鍥剧墖/瑙嗛鐢熸垚杩囩▼涓樉绀哄疄鏃惰鏃讹紙绉掓暟锛夛紝閬垮厤鐢ㄦ埛闀夸箙绛夊緟鏃犲弽棣?
- 鐢熸垚瀹屾垚鍚庢樉绀烘€荤敤鏃?

**API 鍙潬鎬т慨澶?*
- 淇鍒囨崲 Provider 鏃?`protocol` 瀛楁鏈繚瀛樺埌閰嶇疆鐨?bug锛屽鑷村浘鐗囩敓鎴愬缁堝け璐?
- 鏂板鍗虫ⅵ/Seedream (`ark_image`) 涓撶敤鍥剧墖鐢熸垚绔偣锛屼慨姝?URL 璺緞閿欒
- 鍥剧墖鐢熸垚鏂板鑷姩閲嶈瘯鏈哄埗锛堝け璐ュ悗闂撮殧 2 绉掗噸璇?1 娆★級
- 瑙嗛鐢熸垚鍚屾牱淇 protocol 瑙ｆ瀽閫昏緫

**鐢诲竷妯″紡鍖哄垎**
- 缃戞牸妯″紡锛氱粨鏋勫寲鎺掑垪锛岃嚜鍔ㄥ垎鍒楋紝鏃犵缉鏀惧钩绉伙紝绾粴鍔ㄦ祻瑙?
- 鑷敱妯″紡锛氭棤闄愮敾甯冿紝鑷敱瀹氫綅锛? 鍒楅棿璺濇帓甯冿紝鏀寔缂╂斁骞崇Щ
- 鏂板浘鐗?瑙嗛鐢熸垚鏃讹紝杈规閲戣壊鍛煎惛闂儊鍔ㄧ敾鎻愮ず鐢ㄦ埛

**鍙傝€冨浘鍔熻兘鏀逛负鍙€?*
- 鍙傝€冨浘鎸夐挳榛樿闅愯棌锛屽湪璁剧疆 > 鍏朵粬涓彲寮€鍚?
- 寮€鍚悗瀵硅瘽妗嗗嚭鐜板弬鑰冨浘鎸夐挳

**鍥剧墖鑷姩淇濆瓨**
- 鐢熸垚鐨勫浘鐗囪嚜鍔ㄤ繚瀛樺埌 `Pictures/Gravuresse/` 鐩綍
- 鏀寔 base64 鍜?URL 涓ょ鏍煎紡鐨勫浘鐗囦笅杞戒繚瀛?

**鍏朵粬淇**
- 淇鐢诲竷缂栬緫宸ュ叿鏍忋€屾枃瀛椼€嶅浘鏍囩己澶憋紙TOOL_ICONS 閿悕 type鈫抰ext锛?
- 淇缃戞牸妯″紡澶氬紶鍥剧墖鍙樉绀轰竴寮犵殑甯冨眬闂
- 璁剧疆鏂板銆岃嚜鍔ㄤ繚瀛樺浘鐗囧埌鏈湴銆嶅拰銆屽惎鐢ㄥ弬鑰冨浘銆嶅紑鍏?

#### v1.2.0 (2026-06-04)

**鏃犻檺鐢诲竷**
- 鍙傝€?Figma/Lovart 鐨勭敾甯冧氦浜掞紝榧犳爣婊氳疆浠ュ厜鏍囦负涓績缂╂斁锛屾嫋鎷藉钩绉?
- 娴姩缂╂斁鎺т欢锛氭斁澶с€佺缉灏忋€侀€傚簲鐢诲竷銆佺缉鏀炬瘮渚嬫樉绀?

**鐢诲竷缂栬緫宸ュ叿鏍?*
- 搴曢儴灞呬腑 Figma 椋庢牸宸ュ叿鏍忥細閫夋嫨銆佺Щ鍔ㄣ€侀搮绗斻€佺煩褰€佸渾褰€佺洿绾裤€佹枃瀛?
- 宸ュ叿婵€娲绘椂鍐呰仈鏄剧ず棰滆壊鐩樺拰绾垮閫夐」
- HTML5 Canvas overlay 瀹炴椂棰勮缁樺埗褰㈢姸

**娣卞害鎬濊€?*
- 瀵硅瘽杈撳叆鏍忔柊澧炪€屾繁搴︽€濊€冦€嶅紑鍏筹紝寮€鍚悗璋冪敤 Anthropic extended thinking
- 鎬濊€冭繃绋嬪彲鎶樺彔灞曠ず锛岀嫭绔嬩簬姝ｆ枃鍐呭

**鍙傝€冨浘/瑙嗛**
- 瀵硅瘽杈撳叆鏍忔柊澧炪€屽弬鑰冨浘銆嶆寜閽紝鍙粠绱犳潗鐢诲粖閫夊彇澶氬紶鍙傝€冨浘
- 鍙傝€冨浘缂╃暐鍥鹃瑙堬紝鏀寔鍗曠嫭绉婚櫎
- 鍙傝€冨唴瀹规敞鍏ョ郴缁?prompt锛孉I 缁撳悎涓婁笅鏂囩悊瑙ｆ剰鍥?

**鍥剧墖缂╂斁棰勮**
- 绱犳潗璇︽儏闈㈡澘鍥剧墖鏀寔婊氳疆缂╂斁銆佹嫋鎷藉钩绉汇€佸弻鍑婚噸缃?
- 鐙珛 lightbox 妯″紡鍏ㄥ睆鏌ョ湅

**UI 鍏ㄩ潰浼樺寲**
- 鏍囬鏍忕獥鍙ｆ寜閽敼涓虹簿鑷?SVG 鍥炬爣锛屽叧闂寜閽偓鍋滅孩鑹查珮浜?
- 鍙戦€佹寜閽姞澶с€佹笎鍙橀噾鑹层€佹偓鍋滄斁澶у甫闃村奖
- 搴曢儴妯″瀷鏍忔寜閽姞澶э紝鏍囩澶у啓+閲戣壊鍒嗛殧绾匡紝鐗堟湰鍙疯兌鍥婃牱寮?
- 璁剧疆闈㈡澘杈撳叆妗嗗姞瀹斤紝淇濆瓨鎸夐挳娓愬彉+鎮仠涓婃诞
- 鍏ㄧ粍浠惰縼绉昏嚦 Lucide React 鍥炬爣搴?
- 鑷畾涔夊簲鐢ㄥ浘鏍?

**鍏朵粬**
- 淇瀵硅瘽鍒囨崲鏃跺唴瀹逛涪澶辩殑 bug锛坰tale closure + sync race condition锛?
- 淇 ZoomableImage 鎷栨嫿鍋忕Щ闂寘闂

#### v1.1.0 (2026-06-03)

**鐢熸垚娴佺▼浼樺寲**
- 鍥剧墖鐢熸垚鏀逛负銆屽厛鍑烘彁绀鸿瘝 鈫?纭 鈫?鍐嶇敓鎴愩€嶏紝鐢ㄦ埛鍙湪鐢熸垚鍓嶅闃呭拰璋冩暣 prompt
- 鐢熸垚鍚庢敮鎸佽嚜鐒惰瑷€杩唬淇敼锛孉I 鍩轰簬涓婃 prompt 澧為噺璋冩暣锛屼繚鐣欐弧鎰忕殑閮ㄥ垎
- 浠诲姟鍗＄墖瀹炴椂鏄剧ず鐘舵€侊細寰呯‘璁?鈫?鐢熸垚涓?鈫?宸插畬鎴?澶辫触

**澶氬璇濈鐞?*
- 鏀寔澶氬璇濆苟琛岋紝姣忎釜瀵硅瘽鐙珛娑堟伅鍜岀敾甯冭祫浜?
- 瀵硅瘽鍒楄〃鏍忥細鏂板缓銆佸垏鎹€佸垹闄ゅ璇?
- 瀵硅瘽鏁版嵁鑷姩鎸佷箙鍖栵紝鍒囨崲涓嶄涪澶?

**璁剧疆椤甸潰閲嶆瀯**
- 宸︿晶瀵艰埅甯冨眬锛氶€氱敤璁剧疆锛堝瑙?璇█/鍏朵粬锛? API 閰嶇疆锛堝璇?鍥惧儚/瑙嗛锛?
- 妯″瀷瀛楁鑷姩鑾峰彇锛氳緭鍏?API Key 鍚庤嚜鍔ㄦ媺鍙栧彲鐢ㄦā鍨嬪垪琛紝涓嬫媺閫夋嫨
- Base URL 澧炲姞銆屾仮澶嶉粯璁ゃ€嶆寜閽?
- API 閰嶇疆澧炲姞銆屾竻绌洪厤缃€嶆寜閽?
- 楂樼骇閫夐」锛欳hat 鑷畾涔?System Prompt锛孖mage 鑷畾涔?Negative Prompt
- 鍘婚櫎鍏嶈垂 Pollinations API锛堣川閲忎笉浣筹級

**涓婚涓庡浗闄呭寲**
- 娣辫壊涓婚瀹屾暣瀹炵幇锛圕SS 鍙橀噺鍏ㄨ鐩栵紝鍚郴缁熷亸濂藉獟浣撴煡璇級
- 涓嫳鏂囧垏鎹紝璁剧疆椤?鏍囬鏍?搴曟爮/鑱婂ぉ闈㈡澘鏂囨璺熼殢璇█
- 瀛椾綋澶у皬鍙皟锛堝皬/涓?澶э級
- 璁剧疆缁勪欢鏀圭敤 CSS 鍙橀噺锛岃窡闅忎富棰樺垏鎹?

**浣撻獙鏀硅繘**
- 璁剧疆榻胯疆鍥炬爣鏇挎崲涓烘洿绮捐嚧鐨?Lucide Settings 鍥炬爣
- 娑堟伅姘旀场鏀寔鏂囨湰閫変腑澶嶅埗
- 瀵硅瘽杈撳叆妗?Shift+Enter 鎹㈣锛岃嚜鍔ㄥ楂?
- 鍥剧墖璧勪骇璇︽儏澧炲姞銆屼繚瀛樺埌鏈湴銆嶆寜閽?
- 鍥剧墖鐐瑰嚮鏀惧ぇ棰勮锛坙ightbox锛?
- 淇鍥剧墖/瑙嗛鐢熸垚澶辫触鏃舵棤鍙嶉鐨勯棶棰?
- 淇鎻忚堪鐢婚潰鏃惰瑙﹀彂鍥剧墖鐢熸垚鐨勯€昏緫闂
- 搴熷純妯″瀷鑷姩杩佺Щ锛堝鏃ч厤缃腑鐨?pollinations 鑷姩閲嶇疆锛?

#### v1.0.0 (2026-06-03)

- 瀵硅瘽椹卞姩鐨勫妯℃€佺敓鎴愶細杈撳叆鑷劧璇█锛孉I 鑷姩璇嗗埆鎰忓浘骞惰皟搴﹀浘鍍?瑙嗛浠诲姟
- 鏀寔澶氬瀵硅瘽銆佸浘鍍忋€佽棰?Provider
- 绱犳潗鐢诲粖鏀寔缃戞牸/鑷敱甯冨眬锛屽彸閿彍鍗曟搷浣?
- 瑙嗛鐢熸垚浠诲姟闃熷垪锛屾敮鎸佽繘搴﹁拷韪笌閲嶈瘯
- 璁剧疆闈㈡澘鎸夎建閬撶嫭绔嬮厤缃?Provider銆丄PI Key銆丅ase URL銆佹ā鍨?
- 涓€閿繛鎺ユ祴璇曢獙璇?API Key
- 鐧借壊涓婚锛屾敮鎸佹繁鑹?娴呰壊/璺熼殢绯荤粺
- NSIS 瀹夎鍖咃紝鏀寔 Windows x64

---

## English

#### v2.2.0 (2026-07-07)

**Settings restructure & UX fixes**
- Settings restructure: merged Chat/Image/Video API config tabs into a unified Model Pairing page, with per-track Provider + model selection
- Removed redundant ProviderWorkbench component; provider selection now uses dropdown + model input
- Gateway presets reduced from 4 to 3 (removed cpa-compatible)
- Fixed native select dropdown clipping in ChatPanel by replacing with custom ChipSelect popovers
- Added Retry button on error task cards for image/video generation — reuses the original prompt and parameters
- Added `useChat.retryErroredTask` error retry mechanism
- Dev mode proxy bypass: added `proxy-bypass-list` in main process to avoid system proxy interference with localhost dev server

#### v2.1.1 (2026-07-03)

**Security hardening and release refresh**
- Hardened imported project media URLs so unsafe `file:`, `http:`, localhost, private-address, and mismatched data URLs are cleared while keeping asset records.
- Tightened image provider testing so saved credentials only use saved endpoint/template configuration; temporary renderer templates require freshly typed credentials.
- Strengthened production CSP, enabled release signing when certificate environment variables are available, and updated the title-bar version to `v2.1.1`.
- Rebuilt the Windows package and added regression tests for URL sanitization, legacy asset lineage preservation, and provider test credential handling.

#### v2.0.1 (2026-07-01)

**Image API Setup and Relay Demo**
- Added 鈥淩elay / GPT Image 2鈥?as a first-class image API entry, defaulting to `gpt-image-2` and the OpenAI Images-compatible path
- Reordered API settings around the Hermes Agent provider-first flow: choose a provider, choose auth mode, enter credentials, then fetch and select models
- Added a saved model-profile dropdown in API settings so users can switch previous Provider + credential + Base URL + Model combinations directly
- The Provider dropdown now lists only directly callable API providers; subscription/reference entries remain as cards with purchase or login links so they are not saved as unusable active configs
- The current Provider config now shows direct API key, console, billing/purchase, and docs links so setup does not require hunting through provider cards
- Provider cards and the current config now show call/setup modes such as Direct API, Custom API, Subscription info, and Reference, separating callable APIs from account/subscription instructions
- The current Provider config now includes a readiness checklist for credential, endpoint, and model, plus a one-click recommended Base URL/model fill action
- Model fetching and connection tests now fall back to the Provider default endpoint when the current Base URL is empty, reducing setup steps after provider selection
- Simplified image settings around Provider, auth mode, API Key/Session Token, relay Base URL, model, and real image testing; official Provider Base URLs now live under Advanced
- Added a refresh button in the model field so users can manually refetch models after editing credentials or endpoints
- Added a real image generation test that returns a thumbnail from a minimal prompt instead of treating model-list fetching as proof of generation support
- Chat / Image / Video providers now all attempt automatic model-list fetching once configured; Test Connection shows the fetched model result, including custom image/video entries
- Model-list fetching now reuses each Provider's own Bearer, Header, Query, Session, or no-auth configuration instead of assuming relay/Bearer-key auth
- Redacted saved credentials, non-Bearer auth, and no-auth Providers now share the same readiness rules across model fetching, connection tests, real generation, and quick model switching
- Real Provider calls and health checks now honor custom `authType/customAuth` overrides and no-auth Providers, preventing model fetching from succeeding while generation still sends Bearer auth
- Custom image/video API entries now include Query-key auth and keep the full auth option set in renderer fallback Provider lists
- Missing-configuration prompts now refer to provider / credentials / model instead of API keys only; the quick model button shows the current model when no saved profile matches instead of implying the first saved profile is active
- After quick-switching to a saved Provider profile, main-process calls now match the saved profile credentials instead of briefly falling back to the old active Provider; legacy metadata/subscription profiles are hidden from quick switching and saved-profile dropdowns
- Switching between saved profiles under the same Provider now also matches the saved Base URL/model profile, preventing a brief call through the previous endpoint or model
- After selecting a saved profile in Settings, model fetching and connection tests now resolve redacted credentials from that profile instead of relying only on the active Provider
- Chat / Image / Video now show Base URL and model fetching for every executable Provider in the current configuration area, instead of treating relay entries as the only configurable APIs
- Settings no longer hides non-mainstream registry/fallback APIs behind a Provider allowlist; the curated list is now only used as a sorting weight so newly registered Providers remain selectable
- Model fetching now recognizes official versioned API bases such as `/v1`, `/v1beta`, and `/api/v3`, preventing providers like Volcengine from being called with duplicated version paths
- Gemini model fetching now recognizes user-entered `/v1beta` endpoints instead of producing `/v1beta/v1beta/models`
- Model settings now always keep a manual input alongside fetched/built-in dropdown options, so newly released models can be entered before a Provider model list catches up
- Automatic/manual model fetching now shows fetched counts, empty-list guidance, or failure feedback instead of silently clearing the model list
- Settings-initiated model fetching and connection tests now surface redacted Provider errors instead of disguising bad keys, Base URLs, or endpoints as empty model lists
- Providers without a standard model-list endpoint now fall back to recommended/manual models instead of treating 404/405 responses as credential failures
- When a Provider has no explicit default model but does have a built-in catalog, selecting it now saves the first recommended model instead of leaving the config empty
- Legacy configs and saved-profile creation now also fill empty models from Provider recommendations so quick model switching remains available after restart
- Settings save now normalizes empty active-provider models from Provider recommendations, preventing a visible recommendation from being persisted as a blank model
- Custom API settings now include a model-list path so automatic model fetching can use non-standard endpoints such as `/api/models` or `/v1/model/list`, while restricting the path to the configured Base URL
- Custom image/video API advanced settings now expose request methods and JSON body templates for non-standard generation, submit, and poll endpoints without code changes
- Image/video API Providers without native handlers can now be selected as Custom API setups; configured Advanced paths and templates run through the generic custom pipeline
- Renderer fallback Provider lists also normalize media API metadata entries into template-based Custom API setups, preventing dropdown capability loss when the main-process list is unavailable
- Custom image request templates now prefer the Settings-managed `requestBody` field and clear legacy `body/submitBody` aliases while editing, preventing old templates from overriding new input
- Switching Providers now clears the previous Provider's advanced templates, paths, methods, bodies, polling settings, and model-list path so the new Provider cannot accidentally reuse stale API configuration
- Saved Provider profile switching and Clear Config now reuse the same cleanup path, preventing quick model/profile switches from retaining stale advanced API fields
- Legacy profile fields such as `customTemplate`, top-level template fields, and `modelsPath` are normalized into the current `template/modelListPath` shape when switching or saving, preserving custom API setups after upgrades
- Editing or switching the selected model no longer retriggers automatic model fetching; auto-fetch now responds to Provider, credential, endpoint, and auth-mode changes
- When users quickly switch Providers, credentials, or endpoints, stale model-fetch responses are ignored instead of overwriting the current Provider's model list
- Clearing credentials or endpoints now immediately invalidates pending model-fetch writes and clears loading state, preventing stale models from showing under invalid config
- Connection tests and Test Image now use the currently selected auth mode and custom auth parameters instead of falling back to the Provider default authType
- Settings now waits for the main process to persist Provider/model changes before closing, preventing immediate generation from racing against stale config
- While settings are saving, Escape/close actions are disabled and save failures are shown inside the dialog instead of only being logged to the console
- Provider health checks now restrict custom header names, apply query auth parameters, and test the currently typed endpoint when the user enters fresh plaintext credentials
- Provider settings now include built-in model catalogs, so the model dropdown still offers recommended models when online fetching fails or the Provider has no standard model endpoint
- Renderer fallback Provider lists now keep auth modes, model catalogs, call modes, and setup modes so a main-process Provider-list failure does not drop users back to manual setup
- Malformed model-list responses are safely treated as empty lists so Settings does not crash on non-standard relay/provider responses
- Empty model-list results no longer mark the API as unusable; users can still enter a model manually and use Test Image to confirm real generation
- Image-to-video tasks now keep the source image URL on the task and look up assets in the target conversation during execution, preventing source loss across conversation switches or async work
- Custom Image API now deduplicates `/v1` path segments so relay URLs that already include `/v1` do not produce `/v1/v1/images/generations`
- Expanded image response parsing for `b64_json`, `url`, `image_url`, `images`, `output`, `result`, and custom response paths; response paths pointing to `b64_json/base64` are converted to data URLs automatically

#### v2.0.0 (2026-07-01)

**Creative Lineage & Data Resilience**
- Assets now keep generation lineage: provider, model, prompt, parameters, parent asset, references, and task source
- Switching or importing older conversations now normalizes asset shape, so legacy assets without generation fields still enter the same iteration flow
- Imported legacy assets with empty IDs, types, or labels are repaired automatically so lineage and selection state keep a valid asset identity
- Import now repairs duplicate asset IDs and accepts string-form source asset fields, avoiding lineage loss or selection conflicts
- Asset IDs, source IDs, and task IDs are normalized to strings, while unknown asset types fall back to images and `generation.mode` keeps the real generation mode, preventing old projects or external imports from corrupting lineage
- Import now filters non-object assets and ignores non-object generation fields, avoiding corrupted project files polluting creative records
- Asset updates now deep-merge generation fields, preventing partial resolution, status, or position updates from dropping the original prompt, model, and parent asset relationship
- Import now normalizes message and task shape, filters non-object messages, repairs duplicate message IDs, and marks interrupted running tasks as errors so old projects do not spin forever after import
- Conversation title inference now skips malformed messages and empty user content, using the first valid user prompt instead of producing blank imported titles
- Local history loading now reuses the same conversation normalization, so malformed stored messages/assets and numeric activeId/deletedIds no longer bypass import safeguards
- The main-process conversation store now normalizes conversation IDs, activeId, and deletedIds to strings, avoiding selection/deletion mismatches from legacy data
- Conversation ledger updates for messages, task status, and asset add/update/remove are now pure helpers covered by core tests
- Conversation ledger helpers tolerate non-array messages/assets so malformed legacy data does not crash synchronization
- Added `npm run test:core` covering asset normalization, legacy project import compatibility, and error-alert formatting

**Conversation Import/Export**
- Added current-conversation JSON import/export for messages, assets, and creative lineage; imported files create a new local conversation instead of reusing external IDs
- Conversation export now tries to inline remote image/video media as data URLs to reduce loss from expired temporary links
- Added project-level export/import for all conversations; imported projects merge as new local conversations without overwriting history
- Import now rejects obviously invalid JSON payloads and supports older project files that are plain conversation arrays
- Import filters objects without conversation fields; files with no importable conversations now show an explicit error
- Import/export failure alerts now include the concrete error reason, making file-size, format, and write failures easier to diagnose

**Creative Records & Asset Operations**
- Creative records now show generation mode directly, making text-to-image, image-to-video, and other generation modes visible
- Asset details are now creative records with Copy Prompt, Series Variant, Restyle, Regenerate, and Image-to-Video actions
- Regenerate now preserves the original prompt 鈥?bypasses LLM and calls the image API directly
- Series Variant and Restyle now create deterministic image tasks instead of depending on the chat model to return a task
- Asset details and context menus now support Use as Reference, adding the asset to the current input references and focusing the composer
- Asset details and context menus now support Edit Prompt, loading the original prompt back into the composer for quick edits
- Results generated after Edit Prompt keep the source asset as their parent so branched work remains traceable

**Material System**
- Assets can be marked as personal materials; marked items show a star badge and appear first in the reference picker
- Canvas and reference picker can filter to materials only; source asset chips in creative records show hover previews
- Marking materials, deleting assets, and dragging assets on the free canvas now sync immediately into conversation storage, reducing stale state during quick switching or export

**Video Generation Enhancements**
- Image-to-Video now forces the selected image as the video source image; video assets no longer expose a regenerate shortcut that bypasses cost confirmation
- Running Generate Video from an image now switches to the video workspace so the task queue and completed result stay visible

**Canvas Interaction Upgrades**
- Free canvas now includes asset-level undo/redo, a minimap, and lineage-line toggles; user actions like moving, deleting, and marking materials can be restored
- Added a local Agent action queue: suggested next steps are generated from the selected asset and executed only after user confirmation through existing asset actions
- Agent Queue can now copy a reviewable action plan and clears stale queued actions when switching assets, avoiding accidental execution against the wrong asset

**i18n & Settings**
- Regenerate, Edit Prompt, Image-to-Video, and provider preflight errors now follow the active language, reducing Chinese hardcoded copy in the English UI
- API config fields (Key/URL/Model) moved above the provider card grid; no more scrolling to the bottom
- Subscription/plan providers show an info card (homepage/docs/purchase) instead of silently doing nothing
- Removed obsolete unified API page code and duplicate Provider selection controls

#### v1.9.0 (2026-06-29)

**Workspace and Model Entry Refactor**
- Defaults to the Image workspace; the standalone Chat module is removed while the shared chat panel and conversation history remain
- Model selection moved into the chat toolbar and only shows saved chat/current media model candidates
- Canvas now follows the active workspace and filters image/video assets automatically
- OpenNana prompt gallery entry moved next to the Grid/Free canvas controls

**API Settings and Provider Cleanup**
- API settings are split into Chat/Image/Video columns; Video settings follow the experimental video toggle
- Provider lists are trimmed to mainstream entries and separated into usage billing vs subscription/plan sections
- Volcengine Coding Plan and OpenCode Go are fully separated as independent reference entries
- ChatGPT Plus/Pro and Claude Pro/Max are listed as web subscription references only, not callable API providers
- Fixed legacy provider id migration so existing API keys are preserved

**Stability and UX Fixes**
- New users default to the light theme; dark theme select/option and weak text readability improved
- Fixed first-message failures when no active conversation exists
- Strengthened multi-conversation history and image asset retention, including restored-conversation first-send context
- Video generation is hidden by default as an experimental feature to reduce high-cost mistakes

#### v1.8.0 (2026-06-25)

**Provider Profiles 鈥?Multi-Configuration Switching**
- New Provider Profiles system: each track (chat/image/video) can save multiple API Key + model combinations
- New `ModelSelector` component replaces `ModelBar`: quick-switch saved model configs in the chat panel header
- Profile API Keys encrypted via `safeStorage`
- Settings page expanded: profile management, model testing, manual model entry, ratio/resolution preview
- Dedup: saving the same Provider+Model combo auto-merges instead of duplicating

**UI Adjustments**
- Sidebar streamlined: removed "Chat" module (chat panel always visible), defaults to "Image"
- Version badge relocated to title bar
- Chat panel shows mode-specific placeholder (image/video)

#### v1.7.0 (2026-06-24)

**China Media Provider Expansion**
- Added Alibaba Wan: image (wan2.6-t2i) + video (wan2.7-t2v), async submit/poll handlers
- Added Baidu Qianfan: image (qwen-image) + video (qianfan-video-latest), async task handlers
- Added Tencent Hunyuan / TokenHub: video (hy-video-1.5), OpenAI-compatible submit/query handler
- Added Vidu metadata entry
- Added Volcengine Coding Plan / OpenCode reference entry
- Custom Image/Video presets expanded: Qianfan, Hunyuan, Wan, Vidu relay templates

**UI Refactor**
- Layout rebuilt from absolute-positioned gradient mesh to flexbox system
- ModelBar relocated to fixed bottom bar (48px), always visible
- Sidebar restructured: sidebar nav + chat panel + canvas as three-column layout
- Removed glass-floating styles; unified elevated card design
- Settings: added Coding Plan / OpenCode / Jimeng link buttons
- Domestic providers auto-sorted to top

**Provider Registry Polish**
- Volcengine links fully updated to Chinese docs
- Alibaba Wan integrationStatus promoted from metadata 鈫?handler
- Chinese display names and domestic-friendly links across providers

#### v1.6.1 (2026-06-23)

**Improvements**
- NSIS installer: added install-directory selection (no longer one-click)
- Provider ID aliases deduplicated: main process imports from config.js
- Fallback provider lists synced: Chat expanded from 9 to 15 providers, Image added SiliconFlow
- Simplified store.js write queue (aligned with config.js pattern)
- .gitignore enhanced: OS/editor/crash dump/secret file patterns

**Cleanup**
- Removed obsolete files: .codex/, CODEX_TASK.md, stray images/docx in root

#### v1.6.0 (2026-06-21)

**Provider Architecture Refactor**
- Unified provider registry: 17 providers are organized by platform (openai/anthropic/google/volcengine/alibaba/moonshot/zhipu/deepseek/siliconflow/groq/together/openrouter/xai/perplexity/lingyi/runway/happyhorse).
- Unified auth layer: supports bearer, header, query, cookie, and session authentication modes.
- Unified request pipeline: all API calls now go through the `provider:call` IPC channel.
- Each platform can declare multiple capabilities (chat/image/video), instead of splitting providers by track.
- Added platform support for SiliconFlow, Lingyi Wanwu, Groq, Together AI, xAI, and Perplexity.
- Deprecated the legacy `electron/api/chat.js`, `electron/api/image.js`, and `electron/api/video.js` modules.

**UI Style Refresh**
- Updated the palette to a cool blue theme (`#4A6CF7`), replacing the previous gold/amber accents.
- Moved toward a flatter Notion-style surface treatment with fewer shadows, fewer borders, and more whitespace.
- Added the `--space-*` spacing token system.
- Changed dark mode to a deep blue-gray base (`#0D0D12`) instead of warm gray.
- Renamed resolution options to standard labels (Standard/HD/Ultra HD/2K/4K).
- Drawing tools now appear only in Free Canvas mode.

**Other**
- Cleaned project files by removing old API files from the repository and updating `.gitignore`.

**Security & Code Quality Hardening**
- **IPC Scoping**: Lifted window minimize/maximize/close and status query IPC registration from an internal helper scope to the top-level scope of `electron/main.js`, removing a potential memory leak risk and aligning with Electron security practices.
- **UI Style Consistency**: Added global CSS variables for overlay background, gradients, and danger borders, and migrated major components away from hardcoded colors and border values.
- **Icon Wrapper Standardization**: Added missing window control and canvas tool icon mappings in `icons.jsx`, replacing raw `<svg>` and direct lucide imports with `<Ic />`.

**State & Lifecycle Fixes**
- **Ref State Side Effect Cleanup**: Removed direct ref mutation from the `AssetDetail.jsx` state updater and introduced synchronized `offsetRef` reads for latest drag offsets.
- **Free-Move Card State Fix**: Added `updateAssets` batch updates in `useCanvas.js` and refactored Free Mode coordinate initialization in `CanvasPanel.jsx` to assign coordinates in one atomic batch, eliminating cascading rerenders and infinite loop risk.
- **Event Listener Leak Fix**: Added `dragCleanupRef` and unmount cleanup in `CanvasPanel.jsx` so window drag listeners are released if the component unmounts mid-drag.
- **i18n Gap Fixes & Propagation**: Fixed queued/polling video status translations in `MessageBubble.jsx`, passed `lang` into `ContextMenu.jsx` and `TaskQueue.jsx`, and completed model track label translation mapping.

#### v1.5.1 (2026-06-16)

**Security & Quality Hardening**
- **IPC Scoping**: Lifted all window control IPC listeners (minimize, maximize, close, and status query) to the top-level module scope of `electron/main.js`, satisfying Electron secure registry requirements.
- **Theme Consistency**: Replaced hardcoded literal colors and card borders across UI components with central CSS variables from `global.css` (overlay-dark, danger-border, accent-gradient).
- **Icon wrapper `<Ic />` Integration**: Expanded `icons.jsx` to map missing window controls and tools, and refactored components to replace raw SVGs and direct lucide imports with `<Ic />`.

**State & Lifecycle Fixes**
- **State Purity**: Removed state setter side effects in `AssetDetail.jsx` by implementing a synchronized `offsetRef` to read current mouse drag offsets.
- **Coordinate Assignment Batching**: Added the `updateAssets` batch action to `useCanvas.js` and optimized `CanvasPanel.jsx` Free Mode initial coordinates assignment to run in a single atomic update, eliminating infinite loop risks.
- **Memory Leak Prevention**: Created a `dragCleanupRef` in `CanvasPanel.jsx` with an unmount cleanup effect to properly release window mouse move and up event listeners if the panel unmounts mid-drag.
- **i18n Mappings & Propagation**: Resolved translate-to-English bugs for queued and polling states in `MessageBubble.jsx`, propagated `lang` prop to `ContextMenu.jsx` and `TaskQueue.jsx` to render fully translated action menus and queue labels, and mapped model track categories in `ModelBar.jsx`.

#### v1.5.0 (2026-06-08)

**Security Hardening**
- URL redirect safety: blocks HTTPS鈫扝TTP protocol downgrade, limits redirect depth, supports relative redirects
- CSP unification: removed CSP meta tag from index.html, managed exclusively via main process session header
- API key encryption: Electron safeStorage encrypts API keys at rest; decryption failure clears key to avoid sending garbage
- Electron navigation boundary: blocks unexpected app navigation and `window.open` child windows; Markdown external links go through main-process HTTPS validation before `shell.openExternal`
- Renderer config redaction: `config:get` returns redacted API keys; raw secrets stay in the main process and are read by API IPC handlers
- Safe asset saving: removed high-risk arbitrary-path save API; image/video saves go through main-owned paths or save dialog with enforced `.png`/`.mp4` extensions
- Download and response guards: asset downloads enforce HTTPS, revalidate redirects, cap size at 100MB, use wall-clock timeout and temp-file rename; API responses are capped at 25MB
- Atomic file writes: config and conversation data use tmp+rename pattern; concurrent writes serialized via queue
- Gemini API key URL encoding: fixes URL breakage with special characters

**State Management Fixes**
- Conversation rename persistence: fixed bug where renames were lost on page reload
- Conversation switch data safety: switch/new/delete flush the active conversation first; async chat/image/video results write back to the origin conversation
- Conversation store recovery: corrupt `conversations.json` is backed up and replaced with an empty writable store; delete tombstones are enforced on read and write
- Canvas state stability: useCanvas return value memoized, prevents cascading re-renders
- Task queue closure fix: useTaskQueue uses canvasRef to eliminate stale closures
- Video task polling: video submission is wired into the task queue; succeeded-without-`videoUrl` stays running, and completion creates a video asset
- Write queue race fix: history:save routes through unified write queue, prevents concurrent overwrites

**Stability**
- Crash recovery backoff: renderer crashes restart after 5s delay, max 3 attempts, then prompts manual restart
- Error boundary: new ErrorBoundary component shows friendly fallback instead of white screen on render crash
- Settings modal Escape to close, Lightbox Escape to close + click backdrop to close
- Video preview CSP: added `media-src 'self' https: data: blob:`; AssetCard/AssetDetail render video assets with `<video controls>`
- Build dependency refresh: Electron 42.3.3, electron-builder 26.15.2, electron-vite 5.0.0, Vite 7.3.5; packaged builds copy runtime helpers and icon into `dist`

#### v1.3.1 (2026-06-05)

**Canvas Generation Effects**
- Shimmer placeholder cards appear on canvas during image generation, inspired by Lovart's visual style

**Multi-Task Image Support**
- When AI returns multiple generation tasks, all images now display correctly on canvas

**Batch Generation Stability**
- Batch generation no longer stops on single-item failure; placeholders and progress shown throughout

**Save Dialog Fix**
- "Save to file" no longer opens the dialog twice; unified IPC-only save path

**Toolbar Interaction Fix**
- Canvas bottom toolbar buttons now respond correctly, no longer intercepted by canvas drag events

**Context Menu Wired Up**
- Right-click menu on canvas assets works properly: view, download, delete, regenerate

**Conversation Rename**
- Double-click conversation title to rename, with Enter to confirm / Escape to cancel

**Resolution Expansion**
- Added 2K (2560) and 4K (3840) resolution options with proportional dynamic scaling

#### v1.3.0 (2026-06-04)

**Generation Settings in Chat**
- New "Gen Settings" panel in chat toolbar: adjust aspect ratio, style preset, and resolution (Standard/HD/Ultra HD) inline
- Moved from Settings page to chat toolbar for quick access

**Batch Generation**
- New "Batch" button on task cards 鈥?generate 2/3/4 images at once
- Real-time batch progress (e.g. 2/4), failed items skipped

**Elapsed Timer**
- Real-time timer during AI thinking and image/video generation
- Total elapsed time shown on completion

**API Reliability Fix**
- Fixed critical bug: `protocol` field was never saved to config on provider switch, causing image generation to always fail
- Added dedicated Seedream/鍗虫ⅵ (`ark_image`) image generation endpoint with correct URL path
- Added auto-retry for image generation (1 retry after 2s delay)
- Fixed video generation protocol resolution

**Canvas Mode Redesign**
- Grid mode: structured auto-arranged layout, scrollable, no zoom/pan
- Free mode: infinite canvas with absolute positioning in 4-column spread, zoom/pan enabled
- Pulsing gold border animation on assets being generated

**Reference Images Now Optional**
- Reference button hidden by default, toggle in Settings > Other
- Only appears in chat toolbar when enabled

**Auto-Save Images**
- Generated images auto-saved to `Pictures/Gravuresse/` directory
- Supports both base64 and URL image download

**Other Fixes**
- Fixed missing "Text" tool icon in canvas toolbar (TOOL_ICONS key: type鈫抰ext)
- Fixed grid mode only showing one image (layout issue)
- Added "Auto-save images" and "Enable reference images" toggles in Settings

#### v1.2.0 (2026-06-04)

**Infinite Canvas**
- Figma/Loveart-style canvas interaction: scroll-zoom centered on cursor, drag to pan
- Floating zoom controls: zoom in, zoom out, fit canvas, zoom percentage display

**Canvas Edit Toolbar**
- Bottom-centered Figma-style toolbar: select, move, pencil, rectangle, circle, line, text
- Inline color palette and stroke width options when drawing tool is active
- HTML5 Canvas overlay with real-time shape preview

**Deep Thinking**
- New "Think" toggle in chat input, enables Anthropic extended thinking mode
- Collapsible thinking process display, separate from response content

**Reference Images/Videos**
- New "Reference" button to pick multiple images from the asset gallery
- Thumbnail preview with individual remove support
- References injected into system prompt for contextual understanding

**Image Zoom Preview**
- Asset detail image supports scroll-zoom, drag-pan, double-click reset
- Standalone lightbox mode for fullscreen viewing

**UI Overhaul**
- Title bar window buttons replaced with refined SVG icons, close button red highlight on hover
- Send button enlarged with gradient gold, hover scale-up with shadow
- Model bar buttons enlarged, accent uppercase labels with divider, version pill badge
- Settings input fields wider, save button gradient with hover lift
- Migrated all components to Lucide React icon library
- Custom application icon

**Other**
- Fixed conversation disappearing bug on switch (stale closure + sync race condition)
- Fixed ZoomableImage drag offset closure issue

#### v1.1.0 (2026-06-03)

**Generation Flow**
- Image generation now shows prompt for review before execution 鈥?confirm to generate
- Iterative modification via natural language 鈥?AI incrementally adjusts prompt, preserves what you like
- Task cards show real-time status: pending 鈫?generating 鈫?done/error

**Multi-Conversation**
- Parallel conversations with isolated messages and canvas assets
- Conversation bar: create, switch, delete conversations
- Auto-persist conversation data across sessions

**Settings Redesign**
- Sidebar navigation: General (Appearance/Language/Other) + API Config (Chat/Image/Video)
- Auto-fetch model list on API Key entry, dropdown selection
- Base URL restore-to-default button
- Clear config button per provider
- Advanced options: custom system prompt, default negative prompt
- Removed free Pollinations API (low quality)

**Theme & i18n**
- Full dark theme implementation (CSS variables, system preference media query)
- Chinese/English language switching across all UI
- Adjustable font size (small/medium/large)
- Settings component uses CSS variables, follows theme

**UX Improvements**
- Replaced gear icon with refined Lucide Settings icon
- Message text is selectable and copyable
- Chat input auto-resizes, Shift+Enter for newlines
- Asset detail panel: save-to-file button, click-to-zoom preview
- Fixed silent failures on image/video generation errors
- Fixed accidental image generation on descriptive text
- Auto-migrate deprecated models (e.g. pollinations 鈫?provider default)

#### v1.0.0 (2026-06-03)

- Conversation-driven multimodal generation: AI auto-identifies intent and dispatches image/video tasks
- Supports multiple chat, image, and video providers
- Asset gallery with grid/free layout and right-click context menu
- Video task queue with progress tracking and retry
- Settings panel with per-track provider, API key, base URL, and model configuration
- One-click connection test for API key validation
- Light theme with dark/light/system switching
- NSIS installer for Windows x64
