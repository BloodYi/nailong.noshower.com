/* 奶蛙导航站 · NAIWA HUB 全站数据包 */
(function () {
  "use strict";

  // 11 阶奶家人进化谱系（兼任《合成大奶蛙》关卡顺序：最小奶鼠 → 最大奶蛙）
  const FAMILY_TIERS = [
    {
      level: 1,
      id: "naishu",
      name: "奶鼠",
      en: "Nai-Mouse",
      radius: 16,
      score: 2,
      color: "#FFE57F",
      ring: "#EAB308",
      bg: "#FFF9DB",
      img: "/assets/chars/01_naishu.jpg",
      audio: "/assets/audio/01_naishu.mp3",
      audioLabel: "「奶鼠奶鼠！」",
      rank: "吃货级 · B+",
      trait: "大圆耳 · 见酪眼开",
      quote: "放弃一局虚无的游戏，换来一顿实打实的奶酪！",
      desc: "奶家动物园里的最小体型担当，头顶一对超显眼的黄色大圆耳，活脱脱被奶龙附体的杰瑞。在 580 万播放名作《废弃医院躲猫猫》中因一块奶酪光速叛变封神，日常爱和奶粉组队贴贴。"
    },
    {
      level: 2,
      id: "naidan",
      name: "奶蛋",
      en: "Nai-Egg",
      radius: 22,
      score: 4,
      color: "#FFD54F",
      ring: "#F59E0B",
      bg: "#FEF3C7",
      img: "/assets/chars/02_naidan.jpg",
      audio: "/assets/audio/02_naidan.mp3",
      audioLabel: "「安～迪～！」",
      rank: "T0 轮椅 · SSS",
      trait: "无手无脚 · 天下第一萌",
      quote: "这个东西我无法和你解释，因为我只是一只奶蛋。",
      desc: "奶家人里造型最省事的极简大师——四肢删掉、尾巴删掉，只剩一颗圆滚滚的笑脸黄蛋。别看没手没脚，在《选择你的奶伴》二创宇宙中稳居 T0 轮椅神位，主打一个让人无比安心。"
    },
    {
      level: 3,
      id: "naiji",
      name: "奶鸡",
      en: "Nai-Chicken",
      radius: 29,
      score: 8,
      color: "#FFCC80",
      ring: "#FB923C",
      bg: "#FFEDD5",
      img: "/assets/chars/03_naiji.jpg",
      audio: "/assets/audio/03_naiji.mp3",
      audioLabel: "「咯咯蛋落下！」",
      rank: "繁衍担当 · A",
      trait: "红鸡冠 · 奶丑蛋之母",
      quote: "好消息：生出后代了；坏消息：蛋还没孵就会笑了。",
      desc: "头顶鲜红鸡冠的奶科禽类，凭借《奶丑蛋的故事》彻底解决了“奶家人如何繁衍后代”的世纪学术难题，在战力榜中拥有概率召唤奶蛋的神奇技能。"
    },
    {
      level: 4,
      id: "naimao",
      name: "奶猫",
      en: "Nai-Cat",
      radius: 36,
      score: 16,
      color: "#FDE68A",
      ring: "#D97706",
      bg: "#FEF9C3",
      img: "/assets/chars/04_naimao.jpg",
      audio: "/assets/audio/04_naimao.mp3",
      audioLabel: "「喵～！」",
      rank: "萌系担当 · A+",
      trait: "尖耳朵 · 乖巧趴地笑",
      quote: "汤姆猫路过都得愣两秒：这到底是不是同族？",
      desc: "网友完全没打算研究猫科解剖学的产物——往奶龙脑袋上焊一对尖耳朵再让它四脚趴下，一只眼神清澈又带点诡异乖巧的奶猫便顺利出厂。"
    },
    {
      level: 5,
      id: "naigou",
      name: "奶狗",
      en: "Nai-Dog",
      radius: 43,
      score: 32,
      color: "#FDBA74",
      ring: "#EA580C",
      bg: "#FFEDD5",
      img: "/assets/chars/05_naigou.jpg",
      audio: "/assets/audio/05_naigou.mp3",
      audioLabel: "「汪汪！」",
      rank: "喜剧之王 · S",
      trait: "大垂耳 · 掩耳盗铃",
      quote: "正常小狗高兴摇尾巴，奶狗高兴直接冲你咧嘴大笑。",
      desc: "学会四脚着地并装配双垂大耳的抽象犬科。外表人畜无害、笑得格外灿烂，在躲猫猫大赛里贡献了“把头埋起来假装看不见”的掩耳盗铃名场面。"
    },
    {
      level: 6,
      id: "naibao",
      name: "奶包",
      en: "Dou-Nai / Nai-Bao",
      radius: 51,
      score: 64,
      color: "#FCD34D",
      ring: "#B45309",
      bg: "#FEF3C7",
      img: "/assets/chars/06_naibao.jpg",
      audio: "/assets/audio/06_naibao.mp3",
      audioLabel: "「吃我奶奶做的奶黄包！」",
      rank: "跨界顶流 · S+",
      trait: "豆包 × 奶龙 · 奶黄包",
      quote: "请你们吃我奶奶做的奶黄包，你们可以和我一起玩吗？",
      desc: "又称“豆奶”，由两位清澈而愚蠢的卧龙凤雏（豆包 AI 形象 + 奶龙身躯）合体而成的跨界神兽！既常作为 AI 剧场女主登场，也呼应 519 万播放催泪神作《奶黄包》。"
    },
    {
      level: 7,
      id: "naizhu",
      name: "奶猪",
      en: "Nai-Pig",
      radius: 59,
      score: 128,
      color: "#FCA5A5",
      ring: "#EF4444",
      bg: "#FEE2E2",
      img: "/assets/chars/07_naizhu.jpg",
      audio: "/assets/audio/07_naizhu.mp3",
      audioLabel: "「哼哼！」",
      rank: "佛系重坦 · A+",
      trait: "静静看你 · 稳如二大爷",
      quote: "话不多，往地上一躺就是全场最稳的重量级选手。",
      desc: "奶家动物园的厚重底盘代表，圆润憨厚、情绪极度稳定，主打一个“世界再癫我自岿然不动”的松弛感，往那一横直接占半个屏。"
    },
    {
      level: 8,
      id: "naifen",
      name: "奶粉",
      en: "Nai-Pink",
      radius: 68,
      score: 256,
      color: "#F9A8D4",
      ring: "#DB2777",
      bg: "#FCE7F3",
      img: "/assets/chars/08_naifen.jpg",
      audio: "/assets/audio/08_naifen.mp3",
      audioLabel: "「活啦！干巴得！」",
      rank: "异色猛男 · S+",
      trait: "草莓粉皮 · 唯一破色号",
      quote: "别的亲戚都守着黄色家规，唯独我直接换了皮肤！",
      desc: "奶家族谱里最叛逆的配色革命者——通体草莓奶粉红、挺着圆滚大肚皮放肆咧嘴大笑，辨识度拉满，和奶鼠组成了全网人气超高的反差搭档。"
    },
    {
      level: 9,
      id: "naipa",
      name: "奶pa",
      en: "Nai-Papa",
      radius: 77,
      score: 512,
      color: "#D9F99D",
      ring: "#65A30D",
      bg: "#ECFCCB",
      img: "/assets/chars/09_naipa.jpg",
      audio: "/assets/audio/09_naipa.mp3",
      audioLabel: "「我饿了！」",
      rank: "上古元老 · SS",
      trait: "流口水 · 安迪语音包",
      quote: "安～迪！嘎嘎滴辣虾！（可观测宇宙最让人心安的声音）",
      desc: "又称“奶娃 papa”，脱胎于经典流口水抽象改图的最早期奶科元老之一，配上不知火舞的魔性“安迪~”语音在鬼畜与 AI 短剧界流传甚广。"
    },
    {
      level: 10,
      id: "nailong",
      name: "奶龙",
      en: "Nai-Loong",
      radius: 87,
      score: 1024,
      color: "#FBBF24",
      ring: "#D97706",
      bg: "#FEF3C7",
      img: "/assets/chars/10_nailong.jpg",
      audio: "/assets/audio/10_nailong.mp3",
      audioLabel: "「我是奶龙！我才是奶龙！」",
      rank: "家族母体 · SSS",
      trait: "原版胞兄 · 黄色宇宙起源",
      quote: "无论你一开始想画什么，最后都会变成奶龙！",
      desc: "2020 年诞生于深圳第七印象的正版 3D 动画角色，本是主打合家欢与治愈陪伴的圆滚小黄龙，却以一己之力撑起整个 2026 黄色抽象宇宙，成为奶蛙的“原版胞兄”。"
    },
    {
      level: 11,
      id: "naiwa",
      name: "奶蛙",
      en: "Milk Frog · 终极真神",
      radius: 97,
      score: 2048,
      color: "#4ADE80",
      ring: "#15803D",
      bg: "#DCFCE7",
      img: "/assets/chars/11_naiwa.jpg",
      audio: "/assets/audio/11_naiwa.mp3",
      audioLabel: "「哦齁齁齁哈哈哈哈！」",
      rank: "抽象真神 · EX",
      trait: "绿瞳凸眼 · 捂肚狂笑",
      quote: "母惧兄厌，父恨人嫌。非龙不蛙，何为真我？哦齁齁齁！",
      desc: "本宇宙绝对主角、合体终极形态！2024 年 10 月诞生于星野 AI 头像生成畸变，梨形大肚、细长四肢、绿晕凸眼，凭借魔性捂肚狂笑制霸 2026 中文互联网并成功出海。"
    }
  ];

  // 50 张本地托管精选奶蛙表情包（全部源自 MIT 开源社区收集，本地直出零外链失效）
  const MEMES = [
    // --- 魔性动图 GIF (16) ---
    { id: "m02", file: "m02_belly_laugh.gif", cat: "gif", title: "奶蛙摸肚子狂笑", tags: ["狂笑", "动图", "镇站", "捂肚"] },
    { id: "m03", file: "m03_twitch_laugh.gif", cat: "gif", title: "奶蛙抽动狂笑", tags: ["狂笑", "动图", "失控", "魔性"] },
    { id: "m04", file: "m04_hold_to_laugh.gif", cat: "gif", title: "从绷住到狂笑", tags: ["憋笑", "动图", "破防", "反转"] },
    { id: "m05", file: "m05_flip_laugh.gif", cat: "gif", title: "空中翻滚大笑", tags: ["狂笑", "动图", "起飞", "离谱"] },
    { id: "m06", file: "m06_mirror_laugh.gif", cat: "gif", title: "对称双倍狂笑", tags: ["狂笑", "动图", "抽象", "加倍"] },
    { id: "m07", file: "m07_cant_hold.gif", cat: "gif", title: "奶蛙彻底绷不住了", tags: ["绷不住", "动图", "反应", "笑死"] },
    { id: "m08", file: "m08_alarm_sleep.gif", cat: "gif", title: "拍碎闹钟继续睡", tags: ["打工人", "早八", "动图", "睡觉"] },
    { id: "m09", file: "m09_rain_think.gif", cat: "gif", title: "雨中思考蛙生", tags: ["emo", "动图", "哲学", "雨夜"] },
    { id: "m10", file: "m10_boxing.gif", cat: "gif", title: "奶蛙出拳拳击", tags: ["打拳", "动图", "战斗", "健身"] },
    { id: "m11", file: "m11_moonwalk.gif", cat: "gif", title: "丝滑奶蛙太空步", tags: ["跳舞", "动图", "整活", "丝滑"] },
    { id: "m12", file: "m12_fishing_tea.gif", cat: "gif", title: "河边钓鱼喝冰红茶", tags: ["摸鱼", "动图", "松弛", "钓鱼"] },
    { id: "m13", file: "m13_dual_guns.gif", cat: "gif", title: "奶蛙双枪出击", tags: ["火力", "动图", "抽象", "战斗"] },
    { id: "m14", file: "m14_rainbow_dance.gif", cat: "gif", title: "彩虹七彩变色热舞", tags: ["跳舞", "动图", "彩虹", "鬼畜"] },
    { id: "m15", file: "m15_homework.gif", cat: "gif", title: "写作业摸肚子摸鱼", tags: ["学生党", "动图", "作业", "摸鱼"] },
    { id: "m16", file: "m16_mj_frog.gif", cat: "gif", title: "迈克尔·奶克蛙", tags: ["跳舞", "动图", "致敬", "整活"] },
    // --- 聊天神图 & 日常表情 (19) ---
    { id: "m01", file: "m01_laugh_classic.jpg", cat: "daily", title: "经典奶蛙捧腹大笑", tags: ["狂笑", "镇站", "经典", "捂肚"] },
    { id: "m17", file: "m17_rub_belly.jpg", cat: "daily", title: "奶蛙满足摸肚子", tags: ["经典", "吃饱", "日常", "得意"] },
    { id: "m18", file: "m18_side_eye.jpg", cat: "daily", title: "奶蛙侧眼审视你", tags: ["斜眼", "无语", "审视", "质疑"] },
    { id: "m19", file: "m19_belly_sideeye.jpg", cat: "daily", title: "挺肚斜眼嚣张凝视", tags: ["无语", "斜眼", "嚣张", "大肚"] },
    { id: "m20", file: "m20_phone_call.jpg", cat: "daily", title: "奶蛙来电 · 呼叫家里人", tags: ["打电话", "来电", "呼叫", "聊天"] },
    { id: "m21", file: "m21_front_cam.jpg", cat: "daily", title: "误开前置摄像头", tags: ["社死", "真实", "日常", "自拍"] },
    { id: "m22", file: "m22_emo.jpg", cat: "daily", title: "奶蛙彻底 emo 了", tags: ["emo", "委屈", "破防", "低落"] },
    { id: "m23", file: "m23_bed_phone.jpg", cat: "daily", title: "深夜被窝刷手机", tags: ["熬夜", "真实", "刷手机", "日常"] },
    { id: "m24", file: "m24_class_laugh.jpg", cat: "daily", title: "上课疯狂憋笑中", tags: ["憋笑", "学生党", "上课", "日常"] },
    { id: "m25", file: "m25_chin_rest.png", cat: "daily", title: "奶蛙托腮陷入沉思", tags: ["思考", "可爱", "托腮", "发呆"] },
    { id: "m26", file: "m26_confident.jpg", cat: "daily", title: "抱胸自信站立", tags: ["得意", "自信", "装酷", "叉腰"] },
    { id: "m27", file: "m27_heart.jpg", cat: "daily", title: "高难倒立比心喜欢你", tags: ["比心", "卖萌", "贴贴", "表白"] },
    { id: "m28", file: "m28_call_family.jpg", cat: "daily", title: "全网呼叫奶家人！", tags: ["名梗", "集结", "奶家人", "呼叫"] },
    { id: "m29", file: "m29_angry_mode.jpg", cat: "daily", title: "奶蛙切换愤怒模式", tags: ["生气", "红温", "变身", "破防"] },
    { id: "m30", file: "m30_four_think.jpg", cat: "daily", title: "四只奶蛙陷入沉思", tags: ["思考", "群像", "开会", "抽象"] },
    { id: "m47", file: "m47_thumbs_up.jpg", cat: "daily", title: "奶蛙竖大拇指点赞", tags: ["点赞", "夸夸", "好评", "聊天"] },
    { id: "m48", file: "m48_office.jpg", cat: "daily", title: "打工办公奶蛙", tags: ["打工人", "上班", "办公", "摸鱼"] },
    { id: "m49", file: "m49_serious.png", cat: "daily", title: "双手交叉严肃奶蛙", tags: ["严肃", "正经", "高冷", "质疑"] },
    { id: "m50", file: "m50_wechat.png", cat: "daily", title: "微信图标限定绿奶蛙", tags: ["微信", "绿蛙", "图标", "抽象"] },
    // --- 名画与赛博艺术馆 (7) ---
    { id: "m31", file: "m31_starry_night.jpg", cat: "art", title: "梵高《奶蛙星夜》", tags: ["名画", "梵高", "艺术馆", "壁纸"] },
    { id: "m32", file: "m32_scream.jpg", cat: "art", title: "蒙克《奶蛙的呐喊》", tags: ["名画", "蒙克", "震惊", "破防"] },
    { id: "m33", file: "m33_napoleon.jpg", cat: "art", title: "《奶破仑加冕礼》", tags: ["名画", "史诗", "霸气", "艺术馆"] },
    { id: "m34", file: "m34_rushmore.jpg", cat: "art", title: "世界奇观·奶蛙总统山", tags: ["奇观", "总统山", "群像", "名梗"] },
    { id: "m35", file: "m35_terracotta.jpg", cat: "art", title: "蛙龙俑考古现场", tags: ["兵马俑", "考古", "中国馆", "名梗"] },
    { id: "m36", file: "m36_pop_art.jpg", cat: "art", title: "沃霍尔波普奶蛙六宫格", tags: ["波普", "名画", "彩色", "艺术"] },
    { id: "m37", file: "m37_tum_standee.jpg", cat: "art", title: "慕尼黑工大奶蛙立牌奇观", tags: ["高校", "出海", "立牌", "现实"] },
    // --- 奶家人家族 & 奇异变体 (9) ---
    { id: "m38", file: "m38_naidan_explain.jpg", cat: "family", title: "别问我，我只是一只奶蛋", tags: ["奶蛋", "摆烂", "奶家人", "金句"] },
    { id: "m39", file: "m39_naidan_smug.jpg", cat: "family", title: "奶蛋双手抱胸自信笑", tags: ["奶蛋", "得意", "T0", "奶家人"] },
    { id: "m40", file: "m40_naishu_wave.png", cat: "family", title: "奶鼠挥手打招呼", tags: ["奶鼠", "你好", "可爱", "奶家人"] },
    { id: "m41", file: "m41_naigou_laugh.png", cat: "family", title: "奶狗咧嘴狂笑", tags: ["奶狗", "狂笑", "动物园", "奶家人"] },
    { id: "m42", file: "m42_naimao_cute.jpg", cat: "family", title: "奶猫乖巧趴地微笑", tags: ["奶猫", "可爱", "乖巧", "奶家人"] },
    { id: "m43", file: "m43_naiji_real.png", cat: "family", title: "真 · 奶鸡降临", tags: ["奶鸡", "下蛋", "抽象", "奶家人"] },
    { id: "m44", file: "m44_cthulhu_frog.png", cat: "family", title: "古神降临·克苏鲁绿奶蛙", tags: ["绿蛙", "克苏鲁", "变体", "奇幻"] },
    { id: "m45", file: "m45_naiba_bro.jpg", cat: "family", title: "我是奶蛙他哥——奶霸", tags: ["肌肉", "奶霸", "奶家人", "强壮"] },
    { id: "m46", file: "m46_adi_frog.jpg", cat: "family", title: "阿迪达蛙联名款", tags: ["联名", "整活", "运动", "抽象"] }
  ];

  // 16 部真实验证的 B 站高播放奶蛙/奶家人二创视频（本地缩略图 + 真实数据）
  const VIDEOS = [
    {
      bvid: "BV1gaao68EaU",
      cat: "ai",
      title: "奶家人躲猫猫大赛-废弃医院篇【AI全民制作人】",
      author: "奶史_",
      views: "580.8万",
      likes: "8.2万",
      duration: "04:30",
      date: "2026-09-30",
      badge: "年度爆款",
      note: "奶鼠被一块奶酪收买放弃比赛、奶狗掩耳盗铃的世纪名场面出处！"
    },
    {
      bvid: "BV15Qe76cEPt",
      cat: "ai",
      title: "奶蛙｜请你们吃我奶奶做的奶黄包，你们可以和我一起玩吗",
      author: "黄桃肥波已老实版",
      views: "519.5万",
      likes: "1.5万",
      duration: "03:29",
      date: "2026-09-15",
      badge: "全网破防",
      note: "催生「全网呼叫奶家人」情绪共振的 500 万播放现象级奶蛙短片。"
    },
    {
      bvid: "BV1rQpg6oEPZ",
      cat: "ai",
      title: "奶家人躲猫猫大赛-深山城堡篇【AI全民制作人】",
      author: "奶史_",
      views: "448.5万",
      likes: "4.9万",
      duration: "04:05",
      date: "2026-10-10",
      badge: "系列续作",
      note: "奶家人躲猫猫第二弹！奶蛋、奶蛙、奶狗全员集结深山古堡。"
    },
    {
      bvid: "BV1a8xK6MEfM",
      cat: "ai",
      title: "奶家人捉迷藏大赛：幽邃地窟篇【AI全民制作人】",
      author: "暴风城老鼠",
      views: "307.6万",
      likes: "3.9万",
      duration: "04:14",
      date: "2026-10-27",
      badge: "高能整活",
      note: "地窟逃生整活大戏，多位奶科生物各显抽象神通。"
    },
    {
      bvid: "BV1NZKm6hEnp",
      cat: "meme",
      title: "蛋奶质的合成：转录与翻译",
      author: "奶山苏苏",
      views: "267.9万",
      likes: "22.2万",
      duration: "00:51",
      date: "2026-07-20",
      badge: "发顶刊级",
      note: "高中生物课本级魔改！用奶蛋与奶蛙演示“蛋奶质”转录翻译，22 万点赞。"
    },
    {
      bvid: "BV1xDgs6rESz",
      cat: "meme",
      title: "无论画什么东西最后都会变成奶龙",
      author: "Stand404",
      views: "208.0万",
      likes: "7.1万",
      duration: "00:41",
      date: "2026-08-13",
      badge: "精神污染",
      note: "完美诠释黄色宇宙引力坍缩：万法归宗，万物皆可奶化。"
    },
    {
      bvid: "BV1FwoFB3EJ7",
      cat: "lore",
      title: "奶蛙是从哪里来的？",
      author: "乌一666",
      views: "118.2万",
      likes: "5250",
      duration: "01:38",
      date: "2026-04-19",
      badge: "起源必看",
      note: "百万播放考古视频，快速回溯奶蛙诞生的第一现场与早期演化。"
    },
    {
      bvid: "BV1rV8v6LEqT",
      cat: "meme",
      title: "[奶蛙×奶龙手书]像个笨蛋一样（这算不算水仙）",
      author: "死在爱人的怀里",
      views: "61.4万",
      likes: "8.7万",
      duration: "01:00",
      date: "2026-08-24",
      badge: "神仙手书",
      note: "超高水准手绘同人，描绘胞兄奶龙与畸变奶蛙之间宿命感拉满的羁绊。"
    },
    {
      bvid: "BV1mMgL6EEPK",
      cat: "lore",
      title: "【绝对不能落下的梗】奶蛙之父",
      author: "妙木山牛蛙仙人",
      views: "54.5万",
      likes: "2.4万",
      duration: "00:47",
      date: "2026-08-12",
      badge: "经典名梗",
      note: "「母惧兄厌，父恨人嫌。非龙不蛙，何为真我？」高赞热评诞生地。"
    },
    {
      bvid: "BV1EWxd6sEPj",
      cat: "meme",
      title: "【影之刃零Mod】鬼新娘豆包：奶龙，你好狠的心！",
      author: "知更鸟",
      views: "52.5万",
      likes: "9740",
      duration: "03:30",
      date: "2026-11-04",
      badge: "游戏 MOD",
      note: "国产动作大作惨遭奶蛙×豆包×奶龙跨界入侵，抽象演出拉满。"
    },
    {
      bvid: "BV19gbr6mEiw",
      cat: "lore",
      title: "网络人物志第243期：奶蛙",
      author: "人物记录馆-",
      views: "32.6万",
      likes: "1.9万",
      duration: "01:28",
      date: "2026-08-18",
      badge: "人物档案",
      note: "以纪录片口吻正经梳理奶蛙从星野 AI 偏差到统治热搜的完整生平。"
    },
    {
      bvid: "BV1oQ4M69EKj",
      cat: "ai",
      title: "奶蛙的生日（第三集）",
      author: "肥鸡煲",
      views: "16.1万",
      likes: "1885",
      duration: "07:27",
      date: "2026-11-03",
      badge: "原创剧场",
      note: "UP 主自制长篇连续剧，离谱搞笑与伤感剧情反复横跳。"
    },
    {
      bvid: "BV1Db4g67EMs",
      cat: "lore",
      title: "十万个名场面之：奶家人族谱盘点",
      author: "十万个梗百科-本人",
      views: "13.4万",
      likes: "7323",
      duration: "01:06",
      date: "2026-11-03",
      badge: "族谱速览",
      note: "一分钟带你认全奶蛙、奶蛋、奶鼠、奶狗、奶鲸、奶蝠等海量亲戚。"
    },
    {
      bvid: "BV1o1nH6CEyX",
      cat: "meme",
      title: "从夯到区 锐评奶家人",
      author: "史史事托s",
      views: "12.9万",
      likes: "3036",
      duration: "03:26",
      date: "2026-10-22",
      badge: "强度锐评",
      note: "逐一锐评奶家人各位核心选手，评论区奶蛋玩家集体发声！"
    },
    {
      bvid: "BV1ZGYP64Eys",
      cat: "meme",
      title: "合成大奶蛙 7697 分实录",
      author: "闲数欲栖鸦",
      views: "4.5万",
      likes: "357",
      duration: "05:47",
      date: "2026-10-01",
      badge: "游戏攻略",
      note: "《合成大奶蛙》高分实况录像，挑战本站小游戏前可以来偷师！"
    },
    {
      bvid: "BV1Ybam66E6L",
      cat: "lore",
      title: "奶蛙、奶鼠、奶蛋、奶农……奶龙到底被网友生出了多少亲戚？",
      author: "Trixster",
      views: "1.3万",
      likes: "227",
      duration: "19:08",
      date: "2026-10-02",
      badge: "19分钟深挖",
      note: "连户口本带族谱全面盘点 2026 中文互联网最大“黄色物种入侵”。"
    }
  ];

  // 奶蛙编年史时间轴
  const TIMELINE = [
    {
      date: "2020 · 母体诞生",
      title: "原版《奶龙》在深圳上线",
      text: "第七印象文化传媒推出通体金黄、圆润治愈的 3D 动画角色「奶龙」，主打亲子与合家欢陪伴，全网积累近 4000 万粉丝，成为后来一切黄色宇宙二创的源头母体。"
    },
    {
      date: "2024.10.02 · 算法畸变",
      title: "「星野」AI 头像意外催生初代奶蛙",
      text: "据全网考据，网友「纲手[百豪]」在 AI 社交应用「星野」创建奶龙智能体头像时，早期低精度生图模型理解偏差，意外把小黄龙画成了腹部隆起、四肢纤细、凸眼泛绿的梨形青蛙状生物——「奶蛙」就此降生。"
    },
    {
      date: "2025 – 2026 春 · 狂笑破圈",
      title: "AI 视频模型 + 魔性笑声引爆全网",
      text: "随着 Seedance 等视频生成模型普及，网友将奶蛙静态畸变图做成「弯腰捂肚狂笑」「哦齁齁齁」「雨中疾行」动图与短视频，凭借前 2 秒极强魔性钩子迅速席卷抖音、B 站、小红书与各大聊天群。"
    },
    {
      date: "2026.08 · 寻根与切割",
      title: "「奶蛙之父」被考据，全网呼叫奶家人",
      text: "网友顺藤摸瓜找到早期星野智能体作者，但作者担忧原 IP 版权风险连夜删号切割。这场充满宿命感的赛博悲喜剧催生金句「母惧兄厌，父恨人嫌，非龙不蛙，何为真我」，随后与 500 万播放《奶黄包》短片共振，引爆「全网呼叫奶家人」。"
    },
    {
      date: "2026.09 – 11 · 宇宙大爆炸",
      title: "奶家人动物园、奶蛙大学与海外出圈",
      text: "网友衍生出奶鼠、奶蛋、奶狗、奶猫、奶鸡、奶包、奶粉、奶猪等完整「奶家人」家族；虚拟高校「奶蛙大学（21 院 205 专业）」走红；海内外上百所高校自发流转「奶蛙立牌」，更有《蒙娜丽莎》《星夜》等近百件名画被“奶蛙化”收入赛博艺术馆。"
    }
  ];

  // 奶蛙热梗黑话词典
  const GLOSSARY = [
    {
      term: "全网呼叫奶家人",
      tag: "情感共鸣",
      body: "原本奶蛙是因 AI 畸变而生的“丑萌”抽象产物，但在《奶黄包》等二创里常被塑造成被孤立却善良的小生物，网友因此自发在评论区刷起「全网呼叫奶家人」替它撑腰，把整活玩成了温暖的赛博团建。"
    },
    {
      term: "母惧兄厌，非龙不蛙",
      tag: "宿命金句",
      body: "精准概括奶蛙身世的八字真言：「母」指因版权顾虑删除智能体的生母/作者，「兄」指正统合家欢胞兄奶龙。既不被官方承认，又长得不像正经青蛙，却反而获得了最蓬勃的民间生命力。"
    },
    {
      term: "奶蛋 T0 轮椅角色",
      tag: "战力梗",
      body: "在《选择你的奶伴》和《躲猫猫大赛》系列视频中，没手没脚、只会傻笑的奶蛋常常莫名躺赢或带来迷之安全感，被玩家戏称为「版本 T0 轮椅」「令人心安的绝对防御」。"
    },
    {
      term: "奶蛙大学 & 奶校徽",
      tag: "高校文化",
      body: "网友以荒诞方式仿照真实高校体系虚构的「奶蛙大学」，戏称下设 21 个学院、205 个专业；现实中从国内高校到德国慕尼黑工业大学都出现了学生自发摆放、接力打卡的「奶蛙纸板立牌」与各校魔改奶校徽。"
    },
    {
      term: "蛋奶质合成：转录与翻译",
      tag: "鬼畜科普",
      body: "出自 B 站 267 万播放爆款视频，UP 主硬核用 AI 把高中生物“蛋白质合成”全部替换成奶蛋与奶蛙出演，弹幕齐刷「已严肃转发」「这回真能发 Nature 顶刊了」。"
    },
    {
      term: "牛奶蛙 ≠ 奶蛙",
      tag: "硬核辟谣",
      body: "真实自然界确实存在一种亚马逊「牛奶蛙」（Trachycephalus resinifictrix），是蓝白色系的可爱树蛙。因为只差一个字，中文搜索区经常出现找表情包的人和养爬宠的人互相走错片场的奇观。"
    }
  ];

  // 奶蛙生态与实用导航链接
  const NAV_GROUPS = [
    {
      group: "🐸 奶蛙宇宙核心站点",
      desc: "全网最全奶蛙二创、表情库与维基聚合",
      links: [
        { name: "B 站 · 奶蛙二创热榜", url: "https://search.bilibili.com/all?keyword=%E5%A5%B6%E8%9B%99&order=click", icon: "📺", tag: "视频", desc: "按最多播放直达全站最新奶蛙百万神作" },
        { name: "B 站 · 奶家人宇宙专区", url: "https://search.bilibili.com/all?keyword=%E5%A5%B6%E5%AE%B6%E4%BA%BA&order=click", icon: "🏠", tag: "系列", desc: "躲猫猫大赛、选择奶伴、族谱盘点一网打尽" },
        { name: "奶-hub 开源表情仓库", url: "https://github.com/lin-alg/NaiLoong", icon: "🐙", tag: "GitHub", desc: "MIT 开源分布式奶科生物表情包协作仓库" },
        { name: "naiwa.meme 梗百科", url: "https://naiwa.meme/wiki/naiwa/", icon: "📖", tag: "百科", desc: "奶蛙出处、与奶龙区别、头像壁纸聚合站" },
        { name: "奶蛙名画博物馆百科", url: "https://works.cohub.live/w/0d0f026e-322c-4d1b-bd87-3d67c2ba7454/milk-frog-wiki/344cbb06b839/content/index.html", icon: "🖼️", tag: "艺术", desc: "收录 94 件奶蛙化世界名画与 16 大展厅档案" },
        { name: "YouTube · Milk Frog", url: "https://www.youtube.com/results?search_query=%E5%A5%B6%E8%9B%99", icon: "▶️", tag: "出海", desc: "围观海外网友与老外反应视频中的奶蛙文化" }
      ]
    },
    {
      group: "🧰 创作者 & 冲浪效率直达",
      desc: "日常摸鱼、找灵感与制作新奶蛙表情包的常用工具",
      links: [
        { name: "豆包 AI", url: "https://www.doubao.com/", icon: "🫘", tag: "AI", desc: "奶包/豆奶宇宙另一位灵魂主角，对话生图顺手玩" },
        { name: "GitHub", url: "https://github.com/", icon: "💻", tag: "开发", desc: "全球最大代码与抽象开源项目托管平台" },
        { name: "哔哩哔哩首页", url: "https://www.bilibili.com/", icon: "⚡", tag: "影音", desc: "二次元与鬼畜整活大本营" },
        { name: "萌娘百科", url: "https://zh.moegirl.org.cn/", icon: "📚", tag: "维基", desc: "ACGN 与中文互联网次文化词条查询" },
        { name: "维基百科", url: "https://zh.wikipedia.org/", icon: "🌐", tag: "知识", desc: "查查真正的亚马逊牛奶蛙到底长啥样" },
        { name: "小红书网页版", url: "https://www.xiaohongshu.com/search_result?keyword=%E5%A5%B6%E8%9B%99", icon: "📕", tag: "种草", desc: "刷高校奶蛙立牌打卡与最新手绘同人" }
      ]
    }
  ];

  // 奶蛙大学录取通知书配置（供趣味测试生成器使用）
  const UNI_MAJORS = [
    { college: "抽象表情管理学院", major: "捂肚狂笑动力学专业", motto: "只要笑得够大声，内耗就追不上我！" },
    { college: "废弃医院躲猫猫学院", major: "奶酪战略诱捕系", motto: "比赛输赢是虚的，手里的奶酪才是真的。" },
    { college: "蛋奶质生命科学学院", major: "转录与翻译魔改专业", motto: "已严肃写入教材，明年直冲顶刊。" },
    { college: "赛博艺术史学院", major: "世界名画奶蛙化修复系", motto: "蒙娜丽莎可以不笑，但奶蛙必须狂笑。" },
    { college: "奶家人动物园管理学院", major: "T0 奶蛋轮椅战术系", motto: "四肢可以不要，但心态必须稳如奶蛋。" },
    { college: "跨界整活传媒学院", major: "海外高校立牌漂流工程系", motto: "让每一栋教学楼走廊都闪耀奶黄圣光。" },
    { college: "星野算法考古学院", major: "低精度提示词畸变研究系", motto: "允许模型犯错，才能诞生伟大的抽象真神。" }
  ];

  // 背景音乐 BGM 曲库（全站本地直出，支持后台播放与实时音量调节）
  const BGM_TRACKS = [
    {
      id: "dj",
      name: "人鱼的眼泪 (DJ版)",
      shortName: "人鱼DJ",
      icon: "🎧",
      subtitle: "豆奶/奶龙热梗小曲 · 128 BPM",
      src: "/assets/audio/bgm_mermaid_dj.mp3",
      durationSec: 125.7
    },
    {
      id: "orig",
      name: "人鱼的眼泪 (原版)",
      shortName: "人鱼原版",
      icon: "🌊",
      subtitle: "EXO 中文原版 · 经典深情旋律",
      src: "/assets/audio/bgm_mermaid_orig.mp3",
      durationSec: 230.9
    },
    {
      id: "off",
      name: "关闭背景音乐",
      shortName: "关BGM",
      icon: "🔇",
      subtitle: "关闭 BGM，仅保留奶家人音效",
      src: null,
      durationSec: 0
    }
  ];

  // Hero 互动奶蛙点击弹幕库
  const DANMAKU_LINES = [
    "喝哈哈哈哈！！🤣",
    "哦齁齁齁齁！！",
    "笑死我了捂肚子🤣",
    "全网呼叫奶家人！",
    "非龙不蛙，何为真我？",
    "安～迪！嘎嘎滴辣虾",
    "别问，我只是一只奶蛋🥚",
    "奶鼠已经为了奶酪叛变了🧀",
    "请你们吃我奶奶做的奶黄包！",
    "奶蛙大学欢迎你录取🎓",
    "这算不算发 Nature 顶刊？",
    "靠括约肌硬撑在雨中疾行💦",
    "无论画什么最后都会变成奶龙"
  ];

  window.NAIWA_DATA = {
    FAMILY_TIERS,
    MEMES,
    VIDEOS,
    TIMELINE,
    GLOSSARY,
    NAV_GROUPS,
    UNI_MAJORS,
    BGM_TRACKS,
    DANMAKU_LINES
  };
})();
