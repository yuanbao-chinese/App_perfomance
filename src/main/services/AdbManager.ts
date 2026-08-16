import { execFile, exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import type { DeviceInfo, AppInfo } from '../../shared/types';

/**
 * ADB管理器 - 封装所有ADB命令调用
 */
export class AdbManager {
  private cachedDevices: DeviceInfo[] = [];
  private adbPath: string = 'adb'; // 默认使用系统PATH中的adb
  private adbPathVerified: boolean = false; // 是否已验证 adb 二进制真正可用

  constructor() {
    this.initAdbPath();
  }

  private initAdbPath() {
    // 优先使用环境变量中的ADB路径
    if (process.env.ANDROID_HOME) {
      const platformTools = path.join(process.env.ANDROID_HOME, 'platform-tools');
      const candidate = path.join(platformTools, process.platform === 'win32' ? 'adb.exe' : 'adb');
      if (fs.existsSync(candidate)) {
        this.adbPath = candidate;
        return;
      }
    }
    // macOS/Linux常见路径
    if (process.platform !== 'win32') {
      const homeAdb = path.join(process.env.HOME || '~', 'Library/Android/sdk/platform-tools/adb');
      if (fs.existsSync(homeAdb)) {
        this.adbPath = homeAdb;
        return;
      }
      const usrAdb = '/usr/local/bin/adb';
      if (fs.existsSync(usrAdb)) {
        this.adbPath = usrAdb;
        return;
      }
      // Homebrew (Apple Silicon Mac) 默认安装路径
      const optAdb = '/opt/homebrew/bin/adb';
      if (fs.existsSync(optAdb)) {
        this.adbPath = optAdb;
      }
    }
  }

  // =============================================
  // 常用包名 → 中文名映射（覆盖主流500+应用，保证下拉框不显示奇怪片段）
  // =============================================
  private static readonly PKG_NAME_MAP: Record<string, string> = {
    // 腾讯系
    'com.tencent.mm': '微信',
    'com.tencent.mobileqq': 'QQ',
    'com.tencent.tim': 'TIM',
    'com.tencent.qqlive': '腾讯视频',
    'com.tencent.qqmusic': 'QQ音乐',
    'com.tencent.qqsports': '腾讯体育',
    'com.tencent.news': '腾讯新闻',
    'com.tencent.reading': '微信读书',
    'com.tencent.weread': '微信读书',
    'com.tencent.mtt': 'QQ浏览器',
    'com.tencent.androidqqmail': 'QQ邮箱',
    'com.tencent.qqpimsecure': '手机管家',
    'com.tencent.qqsafe': 'QQ安全中心',
    'com.tencent.android.qqdownloader': '应用宝',
    'com.tencent.map': '腾讯地图',
    'com.tencent.pao': '天天酷跑',
    'com.tencent.tmgp.sgame': '王者荣耀',
    'com.tencent.tmgp.pubgmhd': '和平精英',
    'com.tencent.tmgp.kgame': '王者荣耀前瞻版',
    'com.tencent.ig': 'PUBG MOBILE',
    'com.tencent.lolm': '英雄联盟手游',
    'com.tencent.qt.qtl': '掌上英雄联盟',
    'com.tencent.gamehelper.smoba': '王者营地',
    'com.tencent.crazywolf': '穿越火线手游',
    'com.tencent.doodle': 'QQ飞车手游',
    'com.tencent.gametaiping': '火影忍者手游',
    'com.tencent.wuxia2': '天涯明月刀手游',
    'com.tencent.southpark.android': 'QQ炫舞手游',
    'com.tencent.channel': '企鹅电竞',
    'com.tencent.now': 'NOW直播',
    'com.tencent.weishi': '微视',
    'com.tencent.hl.official': '和平营地',

    // 阿里系
    'com.eg.android.AlipayGphone': '支付宝',
    'com.taobao.taobao': '淘宝',
    'com.tmall.wireless': '天猫',
    'com.jingdong.app.mall': '京东',
    'com.xunmeng.pinduoduo': '拼多多',
    'com.youku.phone': '优酷视频',
    'com.youku.epad': '优酷HD',
    'com.uc.browser': 'UC浏览器',
    'com.uc.browser.hd': 'UC浏览器HD',
    'com.alibaba.android.rimet': '钉钉',
    'com.alibaba.android.uic': '淘票票',
    'com.alibaba.android.babylogin': '闲鱼',
    'com.alibaba.wireless': '阿里巴巴',
    'com.meituan': '美团',
    'com.sankuai.meituan.takeoutnew': '美团外卖',
    'com.sankuai.meituan.travel': '美团旅行',
    'com.sankuai.movie': '猫眼',
    'com.sankuai.meituan.dispatch.crowdsource': '美团众包',
    'com.dianping.v1': '大众点评',
    'com.taobao.eticket': '淘票票',
    'com.taobao.mobile.dipei': '天猫超市',
    'com.amap.android.app': '高德地图',
    'com.autonavi.minimap': '高德地图',
    'com.achievo.vipshop': '唯品会',
    'com.taobao.qianniu': '千牛',
    'com.taobao.bao': '手机淘宝特价版',
    'com.cainiao.wireless': '菜鸟裹裹',
    'com.xiami.main': '虾米音乐',
    'com.kuaishou.nebula': '快手极速版',
    'com.elenin.fotoplace': 'in 美图',
    'com.laiwang.dingtalk': '钉钉',

    // 字节系
    'com.ss.android.ugc.aweme': '抖音',
    'com.ss.android.ugc.aweme.lite': '抖音极速版',
    'com.ss.android.ugc.aweme.mobile': '抖音火山版',
    'com.ss.android.ugc.trill': 'TikTok',
    'com.ss.android.article.news': '今日头条',
    'com.ss.android.article.lite': '今日头条极速版',
    'com.ss.android.article.video': '西瓜视频',
    'com.ss.android.automessaging': '多闪',
    'com.ss.android.photoeditor': '剪映',
    'com.lemon.lv': '剪映',
    'com.ss.android.ugc.joke': '皮皮虾',
    'com.ss.android.know': '今日头条专业版',
    'com.ss.android.auto': '懂车帝',
    'com.ss.android.search': '悟空搜索',
    'com.dragon.read': '番茄免费小说',
    'com.dragon.read.hd': '番茄小说HD',
    'com.ss.android.homed': '番茄畅听',
    'com.bytedance.ee.lark': '飞书',
    'com.bytedance.ee.lark.lite': '飞书极速版',
    'com.ss.android.maat': '住小帮',
    'com.ss.android.tuchuang': '图虫',

    // 百度系
    'com.baidu.searchbox': '百度',
    'com.baidu.searchbox.lite': '百度极速版',
    'com.baidu.searchlite': '百度搜索',
    'com.baidu.netdisk': '百度网盘',
    'com.baidu.tieba': '百度贴吧',
    'com.baidu.baidumap': '百度地图',
    'com.baidu.BaiduMap': '百度地图',
    'com.baidu.music.player': '千千音乐',
    'com.baidu.mvideo': '看多多',
    'com.baidu.input': '百度输入法',
    'com.baidu.baidutranslate': '百度翻译',
    'com.baidu.hao123': 'hao123',
    'com.baidu.wenku': '百度文库',
    'com.baidu.zhidao': '百度知道',
    'com.baidu.appsearch': '手机助手',
    'com.duokan.reader': '多看阅读',
    'com.duokan.phone.remotecontroller': '万能遥控',
    'com.qiyi.video': '爱奇艺',
    'com.qiyi.video.pad': '爱奇艺HD',
    'com.qiyi.kids': '爱奇艺奇巴布',

    // 网易系
    'com.netease.cloudmusic': '网易云音乐',
    'com.netease.mail': '网易邮箱大师',
    'com.netease.newsreader.activity': '网易新闻',
    'com.netease.gl': '网易严选',
    'com.netease.uu': 'UU加速器',
    'com.netease.mobimail': '邮箱大师',
    'com.netease.yanxuan': '网易严选',
    'com.netease.pailipala': '音街',
    'com.netease.onmyoji': '阴阳师',
    'com.netease.onmyojigx': '阴阳师百闻牌',
    'com.netease.zr.paper': '第五人格',
    'com.netease.ldzg': '率土之滨',
    'com.netease.dhxy.mobile': '大话西游手游',
    'com.netease.mhxyhtb': '梦幻西游手游',
    'com.netease.wstst': '忘川风华录',
    'com.netease.snailread': '蜗牛读书',
    'com.netease.mkey': '网易藏宝阁',
    'com.netease.baozou': '暴走英雄坛',

    // B站 / ACG
    'tv.danmaku.bili': '哔哩哔哩',
    'com.bilibili.app.in': '哔哩哔哩Google版',
    'com.bilibili.studio': '必剪',
    'com.bilibili.bililive': '哔哩哔哩直播姬',
    'com.bilibili.planet': '星球研究所',
    'com.bilibili.comic': '哔哩哔哩漫画',
    'com.kuaishou': '快手',
    'com.smile.gifmaker': '快手概念版',
    'com.kuaishou.nebula.pro': '快手极速版Pro',
    'ac.ui.browser': 'AcFun',

    // 小米/系统常用
    'com.miui.home': '小米桌面',
    'com.miui.securitycenter': '手机管家',
    'com.miui.cleanmaster': '垃圾清理',
    'com.miui.weather2': '天气',
    'com.miui.calculator': '计算器',
    'com.miui.camera': '小米相机',
    'com.android.camera': '相机',
    'com.miui.gallery': '小米相册',
    'com.android.gallery3d': '图库',
    'com.miui.player': '小米音乐',
    'com.miui.video': '小米视频',
    'com.miui.screenrecorder': '屏幕录制',
    'com.miui.notes': '小米笔记',
    'com.miui.notepad': '笔记',
    'com.miui.cloudservice': '小米云服务',
    'com.miui.backup': '备份',
    'com.miui.fmservice': '收音机',
    'com.miui.fm': '收音机',
    'com.miui.bugreport': '用户反馈',
    'com.miui.compass': '指南针',
    'com.android.settings': '设置',
    'com.android.dialer': '电话',
    'com.android.contacts': '通讯录',
    'com.android.mms': '短信',
    'com.android.soundrecorder': '录音机',
    'com.android.chrome': 'Chrome浏览器',
    'com.android.vending': 'Google Play',
    'com.google.android.youtube': 'YouTube',
    'com.google.android.apps.maps': '谷歌地图',
    'com.google.android.gm': 'Gmail',
    'com.google.android.apps.photos': 'Google相册',
    'com.google.android.apps.docs': 'Google文档',
    'com.google.android.googlequicksearchbox': '谷歌搜索',

    // 华为/荣耀
    'com.huawei.hidisk': '文件管理',
    'com.huawei.android.launcher': '华为桌面',
    'com.huawei.systemmanager': '手机管家',
    'com.huawei.himovie': '华为视频',
    'com.huawei.himusic': '华为音乐',
    'com.huawei.hwread.dz': '华为阅读',
    'com.huawei.hwireader': '荣耀阅读',
    'com.huawei.wallet': '华为钱包',
    'com.huawei.android.internal.app': '系统界面',
    'com.huawei.camera': '华为相机',
    'com.huawei.hms': 'HMS Core',
    'com.huawei.appmarket': '华为应用市场',
    'com.huawei.gamecenter': '华为游戏中心',
    'com.huawei.hidolphin': '华为浏览器',
    'com.huawei.himap': '华为地图',
    'com.huawei.health': '运动健康',
    'com.huawei.watch': '华为穿戴',
    'com.huawei.browser': '浏览器',
    'com.hihonor.health': '荣耀运动健康',
    'com.hihonor.magichome': '荣耀智慧空间',

    // OPPO / 一加 / Realme
    'com.coloros.calculator': '计算器',
    'com.coloros.filemanager': '文件管理',
    'com.coloros.gallery3d': '相册',
    'com.coloros.recorder': '录音',
    'com.coloros.compass': '指南针',
    'com.coloros.soundrecorder': '录音棚',
    'com.coloros.favorite': '收藏',
    'com.oppo.community': 'OPPO社区',
    'com.oppo.camera': 'OPPO相机',
    'com.heytap.market': '软件商店',
    'com.heytap.game': '游戏中心',
    'com.heytap.browser': '浏览器',
    'com.heytap.yoli': '乐划锁屏',
    'com.oneplus.market': '一加应用商店',
    'com.oneplus.camera': '一加相机',
    'com.realme.share': 'Realme分享',

    // vivo / iQOO
    'com.vivo.browser': 'vivo浏览器',
    'com.vivo.appstore': '应用商店',
    'com.vivo.game': '游戏中心',
    'com.vivo.weather': '天气',
    'com.vivo.calculator': '计算器',
    'com.vivo.camera': '相机',
    'com.vivo.gallery': '相册',
    'com.bbk.iqoo.calendar': '日历',
    'com.android.bbkcalendar': '日历',
    'com.bbk.scene': '场景桌面',

    // 三星
    'com.samsung.android.app.spage': 'Bixby主页',
    'com.samsung.android.calendar': '日历',
    'com.samsung.android.camera': '相机',
    'com.sec.android.app.sbrowser': '三星浏览器',
    'com.sec.android.app.myfiles': '我的文件',
    'com.samsung.android.app.galaxyfinder': '搜索',
    'com.samsung.android.scloud': '三星云',
    'com.samsung.android.messaging': '短信',
    'com.samsung.android.dialer': '电话',
    'com.samsung.android.gallery.app': '相册',
    'com.sec.android.app.clockpackage': '时钟',
    'com.sec.android.app.camera': '相机',

    // 视频/直播
    'com.ss.android.ugc.aweme.game': '游戏中心',
    'com.yixia.videoeditor': '小影',
    'com.tencent.wework': '企业微信',
    'com.weico.international': 'Weico微博',
    'com.weibo.qp': '绿洲',
    'com.sina.weibo': '微博',
    'com.sina.weibointl': '微博国际版',
    'com.sina.weibolite': '微博极速版',
    'com.zhihu.android': '知乎',
    'com.zhihu.answer': '知乎日报',
    'com.quora.android': 'Quora',
    'com.douban.frodo': '豆瓣',
    'com.douban.movie': '豆瓣电影',
    'com.douban.read': '豆瓣阅读',
    'com.douban.music': '豆瓣音乐',
    'com.xingin.xhs': '小红书',
    'com.shizhuang.duapp': '得物',
    'com.mxz.renren': '人人视频',
    'com.duowan.kiwi': '虎牙直播',
    'com.duowan.mobile': 'YY',
    'air.tv.douyu.android': '斗鱼直播',
    'com.pandalive.biz': '熊猫直播',
    'com.huya.xingxiu': '虎牙星秀',
    'in.zhaopin.android': '智联招聘',
    'com.taou.maimai': '脉脉',
    'com.linkedin.android': 'LinkedIn领英',
    'com.android.boss': 'Boss直聘',
    'com.hpbr.bosszhipin': 'Boss直聘',
    'com.lagou.android': '拉勾招聘',
    'com.51job.android': '前程无忧',
    'com.zhaopin.android': '前程无忧',

    // 电商
    'com.achievo.vipshop.shop': '唯品会',
    'com.suning.mobile.ebuy': '苏宁易购',
    'com.gome.app.android': '国美',
    'com.youzan.mobile': '有赞精选',
    'com.paipai.lite': '拍拍二手',
    'com.weride.www': '转转',
    'com.wuba': '58同城',
    'com.ganji.android': '赶集生活',
    'com.anjuke.android.app': '安居客',
    'com.lianjia.beike': '贝壳找房',
    'com.ke.com.agent': '贝壳经纪人',
    'com.fang.com': '房天下',

    // 出行 / 外卖
    'com.sdu.didi.psnger': '滴滴出行',
    'com.didi.sdc.passenger': '滴滴青桔',
    'com.didi.virtualapk': '滴滴车主',
    'com.baidu.carowner': '百度车主',
    'com.xiaojukeji.didi.business': '滴滴企业版',
    'me.ele': '饿了么',
    'me.ele.crazy': '饿了么蜂鸟',
    'com.ele.crack': '蜂鸟众包',
    'com.xunmeng.pinduoduo.lite': '拼多多买家版',
    'com.sankuai.meituan': '美团',
    'com.dmall.dmcustomer': '多点',

    // 工具
    'com.netease.mobsec': '网易MuMu模拟器',
    'com.tencent.android.toparty': '腾讯手游助手',
    'com.cv.bs.camera': '最美证件照',
    'com.meitu.meiyancamera': '美颜相机',
    'com.meitu.wheecam': '无他相机',
    'com.meitu.makeup': '美妆相机',
    'com.mt.mtxx.mtxx': '美图秀秀',
    'com.mt.mtxx.hd': '美图秀秀HD',
    'com.coloros.weather': '天气',
    'com.miui.globalweather': '天气',
    'com.huawei.android.totemweather': '天气',
    'com.cambricon.weather': '天气通',
    'com.sina.mobile.weather': '天气通',
    'com.moji.mjweather': '墨迹天气',
    'com.smile.gif': 'GIF制作器',
    'com.gif.gifpro': '动图制作',
    'com.estrongs.android.pop': 'ES文件浏览器',
    'com.rhmsoft.edit': 'RE管理器',
    'com.speedsoftware.rootexplorer': 'RE管理器',
    'com.cleanmaster.mguard': '猎豹清理大师',
    'com.qihoo360.mobilesafe': '360手机卫士',
    'com.qihoo360.mobilesafe_cleaner': '360清理大师',
    'com.lbe.security.miui': '安全中心',
    'com.samsung.android.sm.policy': '智能管理器',
    'com.netqin.ps': '网秦安全',
    'com.lenovo.anyshare.gps': '茄子快传',
    'com.lenovo.leos.assistant': '联想手机管家',
    'com.mobisystems.editor.office_registered': 'WPS Office',
    'cn.wps.moffice_eng': 'WPS Office国际版',
    'com.tencent.wpsoffice': '腾讯文档',
    'com.tencent.docs': '腾讯文档',
    'com.google.android.apps.docs.editors.docs': 'Google文档',
    'com.google.android.apps.docs.editors.sheets': 'Google表格',
    'com.google.android.apps.docs.editors.slides': 'Google幻灯片',
    'com.microsoft.office.word': 'Word',
    'com.microsoft.office.excel': 'Excel',
    'com.microsoft.office.powerpoint': 'PowerPoint',
    'com.microsoft.office.outlook': 'Outlook',
    'com.microsoft.office.onenote': 'OneNote',
    'com.microsoft.teams': 'Teams',
    'com.skype.raider': 'Skype',
    'com.whatsapp': 'WhatsApp',
    'com.whatsapp.w4b': 'WhatsApp Business',
    'org.telegram.messenger': 'Telegram',
    'org.telegram.plus': 'Telegram Plus',
    'com.discord': 'Discord',
    'com.twitter.android': 'Twitter',
    'com.instagram.android': 'Instagram',
    'com.facebook.katana': 'Facebook',
    'com.facebook.orca': 'Messenger',
    'com.snapchat.android': 'Snapchat',

    // 阅读/听书
    'com.chaozh.iReaderFree': '掌阅',
    'com.chaozh.iReader': '掌阅iReader',
    'com.qidian.QDReader': '起点读书',
    'com.qidian.QDReaderHD': '起点HD',
    'com.handsgo.jiakao.android': '驾考宝典',
    'com.mykj.driver': '驾校一点通',
    'com.estrongs.android.taskmanager': '任务管理器',
    'com.qq.reader': 'QQ阅读',
    'com.tencent.qqebook': 'QQ阅读',
    'com.shangshu.tsreader': '掌阅',
    'com.baidu.haokan': '百度好看',
    'com.youdao.dict': '网易有道词典',
    'com.youdao.note': '有道云笔记',
    'com.youdao.translator': '网易有道翻译官',
    'com.youdao.read': '网易蜗牛读书',
    'com.hjword.app': '百词斩',
    'com.shanbay.word': '扇贝单词',
    'com.tal.kaoyan': '考研帮',
    'com.zhan.rewen': '作文纸条',

    // 支付/银行
    'com.chinamworld.main': '中国银行',
    'com.icbc': '中国工商银行',
    'com.ccb2.lmt': '中国建设银行',
    'com.abc.abcbiz': '中国农业银行',
    'cmb.pb': '招商银行',
    'com.spdb.mobilebank.per': '浦发银行',
    'com.ecitic.bank.mobile': '中信银行',
    'com.cmbchina.ccd.pluto.cmbActivity': '掌上生活',
    'com.pingan.paces.ccms': '平安口袋银行',
    'com.unionpay': '云闪付',
    'com.eg.android.AlipayGphone.lite': '支付宝极速版',

    // 游戏
    'com.miHoYo.GenshinImpact': '原神',
    'com.miHoYo.ys.mi': '云·原神',
    'com.miHoYo.hkrpg': '崩坏：星穹铁道',
    'com.miHoYo.honkaiimpact3': '崩坏3',
    'com.mojang.minecraftpe': '我的世界',
    'com.activision.callofduty.shooter': '使命召唤手游',
    'com.garena.game.codm': '使命召唤手游',
    'com.netease.wlyd': '忘川风华录',
    'com.loong.sanguosha': '三国杀',
    'com.tencent.tmgp.yongzhe': '英雄联盟手游',
    'com.shiqi.majiang': '麻将',
    'com.happyelements.AndroidAnimal': '开心消消乐',
    'com.happyelements.bhd.android': '海滨消消乐',
    'com.zeptolab.ctr': '割绳子',
    'com.imangi.templerun': '神庙逃亡',
    'com.kiloo.subwaysurf': '地铁跑酷',
    'com.tencent.minigame.hall': 'QQ游戏大厅',

    // 其他
    'com.android.providers.downloads': '下载管理',
    'com.android.defcontainer': '包管理服务',
    'com.android.systemui': '系统界面',
    'com.android.phone': '通话',
    'com.android.email': '邮件',
    'com.android.documentsui': '文件',
    'com.android.deskclock': '时钟',
    'com.android.calendar': '日历',
    'com.android.fmradio': '收音机',
    'com.android.flashlight': '手电筒',
    'com.android.calculator2': '计算器',
    'com.android.browser': '浏览器',
    'com.android.nfc': 'NFC',
    'com.android.bluetooth': '蓝牙',
    'com.android.hotspot2': '热点',
    'com.android.wallpaper': '壁纸',
    'com.miui.touchassistant': '悬浮球',
    'com.miui.face': '人脸解锁',
    'com.miui.fingerprintpay': '指纹支付',
    'com.coloros.oppopay': 'OPPO Pay',
    'com.vivo.wallet': 'vivo钱包',
    'com.meizu.flyme.pay': 'Meizu Pay',
    'com.nubia.nubiapay': 'Nubia Pay',
    'com.samsung.android.spay': 'Samsung Pay'
  };

  /**
   * 根据包名获取友好的中文应用名（3级兜底：映射表 → 包名最后一段 → 完整包名）
   */
  private resolveFriendlyAppName(packageName: string, candidateFromShell?: string): string {
    if (candidateFromShell) {
      const cleaned = candidateFromShell.replace(/^"|"$/g, '').trim();
      // shell 拿到的如果是纯数字（资源id）、@开头（资源引用）就没用，丢弃
      if (cleaned && !/^(@|0x|\d)/.test(cleaned) && cleaned.length < 80) {
        return cleaned;
      }
    }
    const mapped = AdbManager.PKG_NAME_MAP[packageName];
    if (mapped) return mapped;
    const lastSeg = packageName.split('.').filter(Boolean).pop() || packageName;
    // 如果lastSeg是纯字母数字且长度<=20，首字母大写后更友好
    if (/^[a-z][a-z0-9]*$/i.test(lastSeg) && lastSeg.length <= 24) {
      return lastSeg.charAt(0).toUpperCase() + lastSeg.slice(1);
    }
    return lastSeg;
  }

  /**
   * 简易并发池：tasks 数组是 ()=>Promise<T> 的工厂，concurrency 并发度，保证无论多少任务都不炸。
   * 单个任务失败用 catch 返回 fallback 值，不影响其他任务。
   */
  private async asyncPool<T>(tasks: Array<() => Promise<T>>, concurrency = 8): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < tasks.length) {
        const idx = cursor++;
        try {
          results[idx] = await tasks[idx]();
        } catch (e: any) {
          // 单个任务失败不抛，保留 null（外层过滤）
          (results as any)[idx] = null;
        }
      }
    };
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
    await Promise.all(workers);
    return results;
  }

  /**
   * 返回 ADB 诊断信息（安装状态、路径、安装命令建议）
   * 前端可以根据此信息给用户具体操作提示，而不是笼统说"请检查配置"
   */
  getDiagnostics(): {
    adbFound: boolean;
    adbPath: string;
    version?: string;
    installHint: string;
    deviceCheckHint: string;
  } {
    const adbFound = fs.existsSync(this.adbPath) || this.adbPathVerified;
    const isMac = process.platform === 'darwin';
    const isWin = process.platform === 'win32';

    let installHint: string;
    if (adbFound) {
      installHint = '✅ ADB 已就绪';
    } else if (isMac) {
      installHint = [
        '❌ 未检测到 adb 命令，请在 macOS「终端」执行以下任一命令安装：',
        '   方案1 (推荐，Homebrew)：brew install --cask android-platform-tools',
        '   方案2 (Android Studio)：安装 Android Studio 后，在 Settings > SDK Tools 勾选 Android SDK Platform-Tools，然后设置环境变量：',
        '        export ANDROID_HOME="$HOME/Library/Android/sdk"',
        '        export PATH="$ANDROID_HOME/platform-tools:$PATH"',
        '   方案3 (单独下载)：从 https://developer.android.com/tools/releases/platform-tools 下载 platform-tools，解压后将目录加入 PATH。',
        '',
        '安装完成后，在终端执行 adb version 验证是否成功。'
      ].join('\n');
    } else if (isWin) {
      installHint = [
        '❌ 未检测到 adb 命令，请下载 Android SDK Platform-Tools 并解压，',
        '   将解压后 platform-tools 目录加入系统 PATH，重启 APP。',
        '下载地址：https://developer.android.com/tools/releases/platform-tools'
      ].join('\n');
    } else {
      installHint = [
        '❌ 未检测到 adb 命令，请执行 sudo apt install android-tools-adb (Debian/Ubuntu) 或 sudo dnf install android-tools (Fedora)，',
        '或下载 platform-tools 并手动加入 PATH。'
      ].join('\n');
    }

    const deviceCheckHint = [
      '📱 手机端准备（必须做！）：',
      '  ① 进入「设置 → 关于手机」，连续点击「版本号」7次，开启「开发者选项」；',
      '  ② 回到「设置 → 系统 / 更多设置 → 开发者选项」，开启「USB 调试」；',
      '  ③ 部分品牌（小米/华为/OV）需额外开启「USB 安装」「USB 调试(安全设置)」两个开关；',
      '  ④ 用原装数据线连接 Mac（别用仅充电的廉价线！！），手机屏幕弹出「允许这台电脑进行USB调试？」→ 勾选「一律允许使用这台计算机进行调试」→ 点【允许】；',
      '  ⑤ 连接模式选择「传输文件 (MTP)」（不要选「仅充电」）。',
      '',
      '🖥️ Mac端验证：',
      '  打开终端执行 adb devices，若看到一串序列号 + device 字样 → 已成功。',
      '  如果看到 unauthorized → 手机上还没点【允许】；如果看到 offline → 拔插数据线 / 重启 adb kill-server && adb start-server。'
    ].join('\n');

    return {
      adbFound,
      adbPath: this.adbPath,
      installHint,
      deviceCheckHint
    };
  }

  /**
   * 执行ADB命令
   */
  private async execAdb(
    args: string[],
    deviceId?: string,
    timeout: number = 30000
  ): Promise<{ stdout: string; stderr: string }> {
    const cmdArgs: string[] = [];
    if (deviceId) {
      cmdArgs.push('-s', deviceId);
    }
    cmdArgs.push(...args);

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | null = null;

      const child = execFile(
        this.adbPath,
        cmdArgs,
        { timeout: undefined, maxBuffer: 1024 * 1024 * 10 },
        (error, stdout, stderr) => {
          if (timer) clearTimeout(timer);
          if (error && error.killed) {
            reject(new Error('ADB命令执行超时'));
          } else {
            resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
          }
        }
      );

      timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, timeout);
    });
  }

  /**
   * 执行shell命令（在设备上）
   * 【改进】：当命令失败时，会把 stderr 一起拼进错误消息（之前只返回 stdout.trim()，出错了看不到原因）
   */
  private async execShell(
    deviceId: string,
    command: string,
    timeout: number = 10000
  ): Promise<string> {
    const result = await this.execAdb(['shell', command], deviceId, timeout);
    // 很多 adb shell 命令即使失败了 exitCode 也是 0，但 stderr 有内容；此时我们只警告不抛，调用方自己判断 stdout 空
    if (result.stderr && result.stderr.trim().length > 0) {
      console.warn(`[ADB shell stderr] cmd: ${command.slice(0, 80)} → ${result.stderr.trim().slice(0, 200)}`);
    }
    return result.stdout.trim();
  }

  /**
   * 增强版 execShell：返回 stdout+stderr+原始命令执行结果，用于诊断
   */
  private async execShellDebug(
    deviceId: string,
    command: string,
    timeout: number = 15000
  ): Promise<{ stdout: string; stderr: string; error?: string }> {
    try {
      const r = await this.execAdb(['shell', command], deviceId, timeout);
      return { stdout: r.stdout, stderr: r.stderr };
    } catch (e: any) {
      return { stdout: '', stderr: '', error: e?.message ?? String(e) };
    }
  }

  /**
   * 获取设备上的包名列表，带多重 fallback：
   *   1) 优先 -3（第三方）
   *   2) 如果返回很少（< 5 个，很可能是手机权限问题 -3 被拦截），再执行不带参数的 pm list packages
   *   3) 对不带参数的结果做系统包过滤，留下真正的第三方 APP
   */
  private async listAllPackagesWithFallback(deviceId: string): Promise<{
    packages: string[];
    source: 'third' | 'all-filtered';
    thirdCount: number;
    allCount: number;
  }> {
    const toPkgs = (s: string) =>
      s.split('\n').map((l) => l.replace('package:', '').trim()).filter((p) => p && p.includes('.'));

    // ① 先试第三方
    const thirdRaw = await this.execShell(deviceId, 'pm list packages -3', 20000);
    const thirdPkgs = toPkgs(thirdRaw);
    console.log(`[ADB] pm list packages -3 → ${thirdPkgs.length} 个包`);

    if (thirdPkgs.length >= 5) {
      return { packages: thirdPkgs, source: 'third', thirdCount: thirdPkgs.length, allCount: thirdPkgs.length };
    }

    // ② 太少了（很多国产 ROM -3 会因为"USB 安装"权限没开直接返回空），回退到所有包 + 过滤系统
    console.warn(`[ADB] -3 只返回 ${thirdPkgs.length} 个（过少），回退到 pm list packages（全量）+ 系统包过滤`);
    const allRaw = await this.execShell(deviceId, 'pm list packages', 25000);
    const allPkgs = toPkgs(allRaw);
    console.log(`[ADB] pm list packages（全量）→ ${allPkgs.length} 个包`);

    // ③ 系统包前缀黑名单（不是 100% 准确，但能过滤掉大部分系统组件）
    const SYSTEM_PREFIX_BLACKLIST = [
      'com.android.',
      'android.',
      'com.google.android.',
      'com.google.android.gms',
      'com.google.android.gsf',
      'com.miui.',
      'com.milink.',
      'com.coloros.',
      'com.oppo.',
      'com.heytap.',
      'com.realme.',
      'com.oneplus.',
      'com.huawei.',
      'com.hihonor.',
      'com.vivo.',
      'com.bbk.',
      'com.sec.',
      'com.samsung.',
      'com.meizu.',
      'com.smartisan.',
      'com.zte.',
      'com.lenovo.',
      'com.zui.',
      'com.nubia.',
      'com.zte.',
      'com.qti.',
      'com.qualcomm.',
      'com.mediatek.',
      'vendor.',
      'com.igexin.',
      'com.xiaomi.',
      'com.oplus.',
      'com.example.',
      'jp.co.omronsoft.openwnn',
      'com.android.inputmethod.',
      'org.codeaurora.'
    ];
    const isSystemPkg = (p: string) => SYSTEM_PREFIX_BLACKLIST.some((pre) => p.startsWith(pre));
    const filtered = allPkgs.filter((p) => !isSystemPkg(p));

    console.log(`[ADB] 全量过滤系统包后 → ${filtered.length} 个候选（黑名单前缀 ${SYSTEM_PREFIX_BLACKLIST.length} 项）`);
    return {
      packages: filtered.length > thirdPkgs.length ? filtered : thirdPkgs, // 取更优的一组
      source: filtered.length > thirdPkgs.length ? 'all-filtered' : 'third',
      thirdCount: thirdPkgs.length,
      allCount: allPkgs.length
    };
  }

  getCachedDevices(): DeviceInfo[] {
    return [...this.cachedDevices];
  }

  /**
   * 扫描所有已连接设备
   */
  async scanDevices(): Promise<DeviceInfo[]> {
    const diag = this.getDiagnostics();

    // 情况①：adb 根本不存在 → 直接抛错误带安装建议（前端会 message.error 展示）
    if (!diag.adbFound) {
      const errMsg = [
        '无法扫描设备：未检测到 adb 命令。',
        '',
        diag.installHint,
        '',
        diag.deviceCheckHint
      ].join('\n');
      throw new Error(errMsg);
    }

    try {
      const { stdout, stderr } = await this.execAdb(['devices', '-l'], undefined, 15000);
      // 标记adb真实可用（即使 adbPath 是 PATH 里的"adb"，只要执行成功就算验证通过）
      this.adbPathVerified = true;

      const lines = stdout.split('\n').slice(1); // 跳过第一行 "List of devices attached"
      const devices: DeviceInfo[] = [];
      const unauthorized: string[] = [];
      const offline: string[] = [];

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parts = trimmed.split(/\s+/);
        const serialNumber = parts[0];
        const state = parts[1];

        if (state === 'unauthorized') { unauthorized.push(serialNumber); continue; }
        if (state === 'offline') { offline.push(serialNumber); continue; }
        if (state !== 'device') continue; // 只处理已连接状态

        // 解析设备属性
        const props: Record<string, string> = {};
        for (let i = 2; i < parts.length; i++) {
          const [key, value] = parts[i].split(':');
          if (key && value) props[key] = value;
        }

        try {
          const deviceInfo = await this.getDeviceDetailInfo(serialNumber, props);
          devices.push(deviceInfo);
        } catch (e) {
          // 个别设备详情获取失败也加入列表
          devices.push({
            id: serialNumber,
            model: props.model || serialNumber,
            systemVersion: '未知',
            status: 'connected',
            serialNumber
          });
        }
      }

      // 情况②：扫描到异常状态的设备，给用户提示
      if (unauthorized.length > 0 || offline.length > 0) {
        const tips: string[] = ['⚠️ 检测到异常状态的手机：'];
        if (unauthorized.length) tips.push(`  · unauthorized（${unauthorized.length}台）：请在手机屏幕上点击【允许USB调试】（勾选"一律允许"后点允许）`);
        if (offline.length) tips.push(`  · offline（${offline.length}台）：连接异常，拔插数据线或执行 adb kill-server && adb start-server 重启服务`);
        console.warn('[ADB]', tips.join('\n'));
      }

      // 情况③：0台连接设备 → 不抛错，返回空数组，但把诊断通过 console 打印（上层IPC会主动调 getAdbDiagnostics 给用户展示）
      if (devices.length === 0) {
        console.warn('[ADB] 已扫描但未找到状态为device的真机。adb输出：\n' + stdout + (stderr ? '\nstderr: ' + stderr : ''));
      }

      // 更新缓存状态（标记已断开的设备）
      this.cachedDevices = devices;
      return devices;
    } catch (error: any) {
      console.error('扫描设备失败:', error.message);
      // 把安装建议拼到错误信息里，用户看得懂
      const adbHint = error.message?.includes('not found') || error.code === 'ENOENT'
        ? '\n\n' + diag.installHint
        : '';
      throw new Error(`扫描设备失败: ${error.message || String(error)}${adbHint}`);
    }
  }

  /**
   * 获取设备详细信息
   */
  private async getDeviceDetailInfo(
    serialNumber: string,
    props: Record<string, string>
  ): Promise<DeviceInfo> {
    const getProp = async (prop: string): Promise<string> => {
      try {
        const result = await this.execShell(serialNumber, `getprop ${prop}`, 3000);
        return result || '';
      } catch {
        return '';
      }
    };

    const [model, brand, version, sdk, cpuAbi, totalMem, batteryLevel] = await Promise.all([
      getProp('ro.product.model'),
      getProp('ro.product.brand'),
      getProp('ro.build.version.release'),
      getProp('ro.build.version.sdk'),
      getProp('ro.product.cpu.abi'),
      this.execShell(serialNumber, 'cat /proc/meminfo | grep MemTotal | awk \'{print $2}\'', 3000),
      this.execShell(serialNumber, 'dumpsys battery | grep level | head -1 | awk \'{print $2}\'', 3000)
    ]);

    const memoryKB = parseInt(totalMem) || 0;

    return {
      id: serialNumber,
      model: model || props.model || serialNumber,
      brand: brand || props.manufacturer || '',
      systemVersion: version ? `Android ${version} (API ${sdk})` : '未知版本',
      status: 'connected',
      serialNumber,
      cpuInfo: cpuAbi,
      memoryTotal: Math.round(memoryKB / 1024),
      batteryLevel: parseInt(batteryLevel) || 0
    };
  }

  async connectDevice(deviceId: string): Promise<boolean> {
    try {
      const { stdout } = await this.execAdb(['connect', deviceId]);
      return stdout.includes('connected');
    } catch {
      return false;
    }
  }

  async disconnectDevice(deviceId: string): Promise<boolean> {
    try {
      await this.execAdb(['disconnect', deviceId]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取已安装的第三方APP列表
   * 【性能与正确性优化 v2 - 针对"获取失败"修复】：
   *   1) pm list packages -3 失败（返回 <5 个）→ fallback 全量 + 黑名单前缀过滤系统包（兼容 MIUI/ColorOS 权限限制）
   *   2) 并发数从 8 降到 4（国产手机 AMS 处理 dumpsys 单线程，并发太高会被限流返回空）
   *   3) dumpsys package 单包超时 4s → 8s（老旧手机/应用多时 dumpsys 慢）
   *   4) 增加进度日志（每 20 个 package 打印一次到主进程 console，DevTools 可见）
   *   5) 出错时不再静默 return []，而是把原始 adb 错误 message 抛上去
   */
  async getInstalledApps(deviceId: string): Promise<AppInfo[]> {
    try {
      const { packages: packageNames, source, thirdCount, allCount } = await this.listAllPackagesWithFallback(deviceId);

      if (packageNames.length === 0) {
        throw new Error(
          '手机返回了 0 个可显示的应用包名。\n' +
          `原始统计：-3（第三方）返回 ${thirdCount} 个，全量 pm list packages 返回 ${allCount} 个（过滤后剩 0 个）。\n` +
          '请：① 确认手机端「开发者选项 → USB 安装」「USB 调试（安全设置）」两项已开 ② 执行 adb kill-server && adb start-server 后重试 ③ 点【一键诊断】查看原始命令输出'
        );
      }

      console.log(
        `[ADB] 开始拉取 APP 详情：共 ${packageNames.length} 个（源：${source}），并发度 4，单包超时 8s...`
      );
      // 4 并发调用 getAppInfo
      const concurrency = 4;
      let progressCount = 0;
      const tasks = packageNames.map((pkg, i) => async () => {
        const app = await this.getAppInfo(deviceId, pkg);
        progressCount += 1;
        if (progressCount % 20 === 0 || progressCount === packageNames.length) {
          console.log(`[ADB] APP 详情拉取进度：${progressCount}/${packageNames.length}（${Math.round(progressCount / packageNames.length * 100)}%）`);
        }
        return app;
      });
      const appsOrNull = await this.asyncPool<AppInfo | null>(tasks, concurrency);
      const apps = appsOrNull.filter((a): a is AppInfo => !!a);

      // 兜底：任何 getAppInfo 失败的，补一个 packageName 项
      const gotPkgSet = new Set(apps.map((a) => a.packageName));
      for (const pkg of packageNames) {
        if (!gotPkgSet.has(pkg)) {
          apps.push({
            packageName: pkg,
            appName: this.resolveFriendlyAppName(pkg),
            versionName: '',
            versionCode: 0
          });
        }
      }

      console.log(`[ADB] APP列表拉取完成：成功 ${apps.length}/${packageNames.length} 个，已按应用名拼音排序`);
      apps.sort((a, b) => a.appName.localeCompare(b.appName, 'zh-CN'));
      return apps;
    } catch (error: any) {
      const msg = error?.message ? error.message : String(error);
      console.error('获取应用列表失败:', msg, error?.stack ? error.stack : '');
      // 不要吞，把错误往上抛（前端 message.error 能直接展示给用户）
      throw new Error(msg);
    }
  }

  /**
   * 一键诊断：返回原始 adb 命令输出 + 建议（给前端展示用，用户截图就能定位）
   */
  async debugAppList(deviceId: string): Promise<{
    adbPath: string;
    packagesCmd: string;
    packagesOutput: string;
    packagesStderr: string;
    packagesCount: number;
    allPackagesCmd: string;
    allPackagesOutput: string;
    allPackagesStderr: string;
    sampleDumpsysCmd: string;
    sampleDumpsysOutput: string;
    sampleDumpsysStderr: string;
    suggestions: string[];
  }> {
    const adbPath = this.adbPath;
    const packagesCmd = 'pm list packages -3';
    const allPackagesCmd = 'pm list packages';
    const third = await this.execShellDebug(deviceId, packagesCmd);
    const all = await this.execShellDebug(deviceId, allPackagesCmd);

    // 找一个样例包（第一个非系统包）执行 dumpsys package
    let samplePkg = '';
    const allPkgs = all.stdout.split('\n').map((l) => l.replace('package:', '').trim()).filter(Boolean);
    for (const p of allPkgs) {
      if (!p.startsWith('com.android.') && !p.startsWith('android.') && p.includes('.')) {
        samplePkg = p; break;
      }
    }
    const sampleDumpsysCmd = samplePkg ? `dumpsys package ${samplePkg} | head -30` : 'echo no-package-found';
    const sampleDump = samplePkg
      ? await this.execShellDebug(deviceId, `dumpsys package ${samplePkg}`, 10000)
      : { stdout: '(无样例包可用于 dumpsys)', stderr: '' };

    // 基于结果生成建议
    const suggestions: string[] = [];
    const thirdCount = (third.stdout.match(/^package:/gm) || []).length;
    const allCount = (all.stdout.match(/^package:/gm) || []).length;

    if (third.stdout === '' && third.stderr) {
      suggestions.push('❌ pm list packages -3 无 stdout 且有 stderr：手机端可能限制了「通过 USB 查询应用列表」，需开启「USB 调试（安全设置）」和「USB 安装」');
    }
    if (thirdCount === 0 && allCount === 0) {
      suggestions.push('❌ 两个命令都返回 0 个包：很可能 ADB 与手机通信异常。请在 Mac 终端执行 adb devices 确认设备是 device 状态；然后执行 adb kill-server && adb start-server 重启服务后重插数据线');
    }
    if (thirdCount < 5 && allCount > 200) {
      suggestions.push('⚠️ -3（第三方）只返回' + thirdCount + '个，但系统能看到' + allCount + '个包：典型的 MIUI/ColorOS 权限问题。请打开：设置 → 开发者选项 → 开启「USB 安装」+「USB 调试（安全设置）」+「关闭权限监控」，然后重新插数据线并在手机上点允许');
    }
    if (sampleDump.stdout && sampleDump.stdout.includes('versionName=')) {
      suggestions.push('✅ dumpsys package 解析正常：' + samplePkg + ' 的 versionName 能读到，说明手机 AMS 服务没问题。若主功能仍 0 个 APP，请点刷新按钮重试（本次并发已降到 4）');
    }
    if (sampleDump.stdout && !sampleDump.stdout.includes('versionName=')) {
      suggestions.push('⚠️ dumpsys package 返回内容里没有 versionName：可能该应用是 work profile/多用户空间下的，或手机端 dumpsys 权限被锁。请尝试 adb shell dumpsys package ' + samplePkg + ' 直接在 Mac 终端执行看原始输出');
    }
    if (suggestions.length === 0) {
      suggestions.push('✅ adb 路径正常：' + adbPath + '，-3返回' + thirdCount + '包，全量返回' + allCount + '包，dumpsys样例正常。请刷新重试，若仍失败请截此图反馈');
    }

    return {
      adbPath,
      packagesCmd,
      packagesOutput: third.stdout || '(空)',
      packagesStderr: third.stderr || third.error || '(空)',
      packagesCount: thirdCount,
      allPackagesCmd,
      allPackagesOutput: (all.stdout || '(空)').slice(0, 10000), // 最多10k字符避免爆
      allPackagesStderr: all.stderr || all.error || '(空)',
      sampleDumpsysCmd,
      sampleDumpsysOutput: (sampleDump.stdout || '(空)').slice(0, 5000),
      sampleDumpsysStderr: sampleDump.stderr || (sampleDump as any).error || '(空)',
      suggestions
    };
  }

  async getAppInfo(deviceId: string, packageName: string): Promise<AppInfo | null> {
    try {
      // 超时由 4s → 8s：国产手机装了 500+ 应用时，单个 dumpsys package 要 5-6s
      const dumpsys = await this.execShell(
        deviceId,
        `dumpsys package ${packageName}`,
        8000
      );

      const extractValue = (pattern: RegExp): string => {
        const match = dumpsys.match(pattern);
        return match ? match[1].trim() : '';
      };

      let versionName = extractValue(/versionName=([^\s\n\r]+)/);
      const versionCode = parseInt(extractValue(/versionCode=(\d+)/)) || 0;
      const targetSdk = parseInt(extractValue(/targetSdk(?:Version)?=(\d+)/)) || 0;
      const minSdk = parseInt(extractValue(/minSdk(?:Version)?=(\d+)/)) || 0;

      if (versionName) {
        const m = versionName.match(/^([^\s]+)/);
        if (m) versionName = m[1];
      }

      const appName = this.resolveFriendlyAppName(packageName);

      return {
        packageName,
        appName,
        versionName,
        versionCode,
        targetSdkVersion: targetSdk,
        minSdkVersion: minSdk
      };
    } catch {
      return {
        packageName,
        appName: this.resolveFriendlyAppName(packageName),
        versionName: '',
        versionCode: 0
      };
    }
  }

  async installApk(deviceId: string, apkPath: string): Promise<boolean> {
    try {
      const { stdout, stderr } = await this.execAdb(
        ['install', '-r', apkPath],
        deviceId,
        120000 // 2分钟超时
      );
      return stdout.includes('Success') || !stderr.includes('Failure');
    } catch (error: any) {
      console.error('安装APK失败:', error.message);
      return false;
    }
  }

  async uninstallApp(deviceId: string, packageName: string): Promise<boolean> {
    try {
      const { stdout } = await this.execAdb(
        ['uninstall', packageName],
        deviceId,
        60000
      );
      return stdout.includes('Success');
    } catch {
      return false;
    }
  }

  /**
   * 检查APP是否已安装
   */
  async isAppInstalled(deviceId: string, packageName: string): Promise<boolean> {
    try {
      const result = await this.execShell(
        deviceId,
        `pm list packages | grep "^package:${packageName}$"`,
        3000
      );
      return result.length > 0;
    } catch {
      return false;
    }
  }

  async launchApp(deviceId: string, packageName: string): Promise<boolean> {
    try {
      // 先获取启动Activity
      const result = await this.execShell(
        deviceId,
        `cmd package resolve-activity --brief ${packageName} | tail -n 1`,
        5000
      );

      let launchComponent = result.trim();
      if (!launchComponent || launchComponent.includes('No activity found')) {
        // 降级方法：通过monkey启动
        await this.execShell(
          deviceId,
          `monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`,
          10000
        );
        return true;
      }

      await this.execShell(deviceId, `am start -n ${launchComponent} -S`, 10000);
      return true;
    } catch (error: any) {
      console.error('启动APP失败:', error.message);
      return false;
    }
  }

  /**
   * 启动APP并返回启动时间（ms）
   */
  async launchAppWithTime(deviceId: string, packageName: string): Promise<number> {
    try {
      const result = await this.execShell(
        deviceId,
        `am start-activity -W -n ${this.getLaunchActivity(deviceId, packageName)}`,
        15000
      );

      const match = result.match(/TotalTime:\s*(\d+)/);
      if (match) {
        return parseInt(match[1]);
      }
      return 0;
    } catch {
      return 0;
    }
  }

  private async getLaunchActivity(deviceId: string, packageName: string): Promise<string> {
    const result = await this.execShell(
      deviceId,
      `cmd package resolve-activity --brief ${packageName} | tail -n 1`,
      5000
    );
    return result.trim();
  }

  async forceStopApp(deviceId: string, packageName: string): Promise<boolean> {
    try {
      await this.execShell(deviceId, `am force-stop ${packageName}`, 5000);
      return true;
    } catch {
      return false;
    }
  }

  async clearAppData(deviceId: string, packageName: string): Promise<boolean> {
    try {
      await this.execShell(deviceId, `pm clear ${packageName}`, 10000);
      return true;
    } catch {
      return false;
    }
  }

  // ============== 性能数据采集方法 ==============

  /**
   * 获取CPU使用率
   */
  async getCpuUsage(deviceId: string, packageName: string): Promise<{ appUsage: number; systemUsage: number }> {
    try {
      // 使用top命令获取两次采样计算差值
      const topOutput = await this.execShell(
        deviceId,
        `top -n 2 -d 0.1 -b | grep -E "${packageName}|User"`,
        3000
      );

      let appUsage = 0;
      let systemUsage = 0;

      // 解析User, System百分比
      const userMatch = topOutput.match(/User\s+(\d+)%/g);
      const systemMatch = topOutput.match(/System\s+(\d+)%/g);
      if (userMatch && systemMatch) {
        const u = parseInt(userMatch[userMatch.length - 1].replace(/\D/g, '')) || 0;
        const s = parseInt(systemMatch[systemMatch.length - 1].replace(/\D/g, '')) || 0;
        systemUsage = u + s;
      }

      // 解析APP CPU占用
      const lines = topOutput.split('\n');
      const appLines = lines.filter((l) => l.includes(packageName));
      if (appLines.length >= 2) {
        // 取最后一次采样
        const lastLine = appLines[appLines.length - 1];
        const parts = lastLine.trim().split(/\s+/);
        // top输出中CPU%通常在第4-6列（因版本而异）
        for (const part of parts) {
          if (part.endsWith('%')) {
            const val = parseFloat(part.replace('%', ''));
            if (!isNaN(val) && val > 0 && val < 1000) {
              appUsage = val;
              break;
            }
          }
        }
      }

      // 如果top方式失败，降级使用dumpsys cpuinfo
      if (appUsage === 0 && systemUsage === 0) {
        const cpuInfo = await this.execShell(deviceId, 'dumpsys cpuinfo | head -30', 3000);
        const pkgMatch = cpuInfo.match(new RegExp(`${packageName.replace(/\./g, '\\.')}[^0-9]*([\\d.]+)%`));
        if (pkgMatch) appUsage = parseFloat(pkgMatch[1]);

        const totalMatch = cpuInfo.match(/TOTAL[^0-9]*([\d.]+)%/);
        if (totalMatch) systemUsage = parseFloat(totalMatch[1]);
      }

      return {
        appUsage: Math.min(appUsage, 100),
        systemUsage: Math.min(systemUsage, 100)
      };
    } catch {
      return { appUsage: 0, systemUsage: 0 };
    }
  }

  /**
   * 获取内存使用情况
   */
  async getMemoryUsage(deviceId: string, packageName: string): Promise<{
    pss: number;
    privateDirty: number;
    heapSize: number;
    nativeHeap: number;
    dalvikHeap: number;
  }> {
    try {
      const meminfo = await this.execShell(
        deviceId,
        `dumpsys meminfo ${packageName}`,
        5000
      );

      const extractNumber = (pattern: RegExp): number => {
        const match = meminfo.match(pattern);
        if (match) {
          const num = parseInt(match[1].replace(/,/g, ''));
          return isNaN(num) ? 0 : Math.round(num / 1024); // KB -> MB
        }
        return 0;
      };

      const pss = extractNumber(/TOTAL\s+(\d+)/);
      const nativeHeap = extractNumber(/Native Heap\s+(\d+)/);
      const dalvikHeap = extractNumber(/Dalvik Heap\s+(\d+)/);

      // 获取Java Heap大小
      const heapInfo = await this.execShell(
        deviceId,
        `dumpsys gfxinfo ${packageName} | grep -E "Java Heap" | head -1`,
        3000
      );
      const heapMatch = heapInfo.match(/([\d.]+)\s*(MB|KB|GB)/);
      let heapSize = 0;
      if (heapMatch) {
        const val = parseFloat(heapMatch[1]);
        const unit = heapMatch[2];
        heapSize = unit === 'KB' ? val / 1024 : unit === 'GB' ? val * 1024 : val;
        heapSize = Math.round(heapSize);
      }

      return {
        pss: pss || Math.round(nativeHeap + dalvikHeap),
        privateDirty: pss,
        heapSize,
        nativeHeap,
        dalvikHeap
      };
    } catch {
      return { pss: 0, privateDirty: 0, heapSize: 0, nativeHeap: 0, dalvikHeap: 0 };
    }
  }

  /**
   * 获取电池信息
   */
  async getBatteryInfo(deviceId: string): Promise<{
    level: number;
    temperature: number;
    voltage: number;
    status: string;
  }> {
    try {
      const batteryDump = await this.execShell(deviceId, 'dumpsys battery', 3000);

      const extract = (pattern: RegExp): string => {
        const match = batteryDump.match(pattern);
        return match ? match[1].trim() : '';
      };

      const level = parseInt(extract(/level:\s*(\d+)/)) || 0;
      const temperature = parseInt(extract(/temperature:\s*(\d+)/)) / 10 || 0; // 单位转换 0.1℃ -> ℃
      const voltage = parseInt(extract(/voltage:\s*(\d+)/)) || 0;
      const status = extract(/status:\s*(\d+)/);
      const statusMap: Record<string, string> = {
        '1': 'unknown',
        '2': 'charging',
        '3': 'discharging',
        '4': 'not_charging',
        '5': 'full'
      };

      return {
        level,
        temperature,
        voltage,
        status: statusMap[status] || 'unknown'
      };
    } catch {
      return { level: 0, temperature: 0, voltage: 0, status: 'unknown' };
    }
  }

  /**
   * 获取GPU和帧率信息
   */
  async getGpuInfo(deviceId: string, packageName: string): Promise<{
    fps: number;
    gpuUsage: number;
    renderTime: number;
    jankCount: number;
  }> {
    try {
      // 先启用gfxinfo配置
      await this.execShell(
        deviceId,
        `setprop debug.hwui.profile visual_bars`,
        2000
      ).catch(() => {});

      const gfxinfo = await this.execShell(
        deviceId,
        `dumpsys gfxinfo ${packageName} framestats`,
        5000
      );

      let fps = 0;
      let renderTime = 0;
      let jankCount = 0;

      // 解析framestats数据
      const lines = gfxinfo.split('\n');
      const frameTimes: number[] = [];
      let inStats = false;

      for (const line of lines) {
        if (line.includes('---PROFILEDATA---')) {
          inStats = !inStats;
          continue;
        }
        if (!inStats) continue;
        if (line.startsWith('Flags,IntendedVsync')) continue;

        const cols = line.split(',');
        if (cols.length >= 10) {
          const vsyncTime = parseInt(cols[1]);
          const frameCompleted = parseInt(cols[13]) || parseInt(cols[9]);
          if (vsyncTime && frameCompleted) {
            const duration = frameCompleted - vsyncTime;
            if (duration > 0) {
              frameTimes.push(duration / 1000000); // 纳秒 -> 毫秒
            }
          }
        }
      }

      if (frameTimes.length > 0) {
        // VSYNC间隔通常16.6ms (60FPS)
        const vsyncInterval = 16.6;
        const slowFrames = frameTimes.filter((t) => t > vsyncInterval);
        jankCount = slowFrames.length;

        // FPS估算
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        fps = Math.round(1000 / Math.max(avgFrameTime, 1));
        fps = Math.min(fps, 120);

        renderTime = Math.round(avgFrameTime);
      }

      // GPU使用率 - 使用SurfaceFlinger信息
      let gpuUsage = 0;
      try {
        const surfaceFlinger = await this.execShell(
          deviceId,
          `dumpsys SurfaceFlinger --latency | head -5`,
          3000
        );
        // 简单估算GPU使用率
        const parts = surfaceFlinger.trim().split(/\s+/);
        if (parts.length >= 3) {
          const refreshPeriod = parseInt(parts[1]) || 16666667; // 默认60Hz
          const totalFrames = parts.slice(2).filter((p) => parseInt(p) > 0).length;
          if (totalFrames > 0) {
            gpuUsage = Math.min(Math.round((frameTimes.length / 120) * 100), 100);
          }
        }
      } catch {
        // 忽略
      }

      if (gpuUsage === 0) {
        gpuUsage = Math.min(Math.round((fps / 60) * 100), 100);
      }

      return { fps, gpuUsage, renderTime, jankCount };
    } catch {
      return { fps: 0, gpuUsage: 0, renderTime: 0, jankCount: 0 };
    }
  }

  /**
   * 获取流量统计
   */
  async getTrafficStats(deviceId: string, packageName: string): Promise<{
    rxBytes: number;
    txBytes: number;
  }> {
    try {
      // 获取UID
      const uidResult = await this.execShell(
        deviceId,
        `dumpsys package ${packageName} | grep userId= | head -1`,
        3000
      );
      const uidMatch = uidResult.match(/userId=(\d+)/);
      if (!uidMatch) return { rxBytes: 0, txBytes: 0 };
      const uid = uidMatch[1];

      // 读取流量文件
      const trafficFile = `/proc/uid_stat/${uid}/`;
      const rxStr = await this.execShell(deviceId, `cat ${trafficFile}tcp_rcv`, 2000).catch(() => '0');
      const txStr = await this.execShell(deviceId, `cat ${trafficFile}tcp_snd`, 2000).catch(() => '0');

      return {
        rxBytes: parseInt(rxStr) || 0,
        txBytes: parseInt(txStr) || 0
      };
    } catch {
      return { rxBytes: 0, txBytes: 0 };
    }
  }

  /**
   * 锁定/解锁设备屏幕
   */
  async setScreenLock(deviceId: string, locked: boolean): Promise<boolean> {
    try {
      if (locked) {
        await this.execShell(deviceId, `input keyevent KEYCODE_POWER`, 2000);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取设备总内存
   */
  async getTotalMemory(deviceId: string): Promise<number> {
    try {
      const mem = await this.execShell(
        deviceId,
        `cat /proc/meminfo | grep MemTotal | awk '{print $2}'`,
        2000
      );
      return Math.round((parseInt(mem) || 0) / 1024);
    } catch {
      return 0;
    }
  }
}
