---
layout: home

hero:
  name: BIM 问题管理平台
  text: 让 AI 替你记录、跟进、闭环问题
  tagline: 面向中小团队 / 简易部署 / 开源 / 私有化
  image:
    src: /logo-mark-lg.svg
    width: 300
    height: 300
    alt: BIM 问题管理平台
  actions:
    - theme: brand
      text: 在线演示
      link: http://120.25.73.105:5555
      target: _blank
      rel: noopener noreferrer
    - theme: alt
      text: 五分钟跑起来
      link: /guide/getting-started
    - theme: alt
      text: 使用手册
      link: /use/user-guide
    - theme: alt
      text: MCP 工具
      link: /reference/api

features:
  - icon: 📝
    title: 记录标准化
    details: 一条问题按六个要素记清：楼层、图纸、位置、结论、详情、建议，谁记都是同一个格式。再按重要程度 / 类型 / 子项 / 专业 / 专项五个维度归类，汇总与追溯都不用手工对齐。
  - icon: 📦
    title: 绿色免安装包
    details: Windows x64 便携版，解压后双击启动脚本即可运行，包内自带 Node 运行时，目标机器无需安装任何依赖；默认附带示例项目，并可注册为 Windows 开机自启任务。
  - icon: 🤖
    title: AI 代理执行
    details: AI 用各人的令牌接入，权限即本人在该项目的权限。AI 改过的内容一律带标记，写清是谁让它做的；删除只生成待删清单，需本人确认。
  - icon: 📤
    title: 三档导出
    details: 三档导出各有用途：带图 HTML 报告（ZIP 打包）用于成果归档，可直接打印成 PDF；Excel 用于外发统计与清单汇总；Word 用于过程讨论。
  - icon: 📊
    title: 问题统计报表
    details: 首页看清项目问题全貌，紧急几条，未关几条，按专业 / 类型 / 专项 / 子项自动分好，四种图一眼分辨。项目问题什么样，进来就知道。
  - icon: 🗄️
    title: SQLite / MySQL 双库
    details: 默认自带 SQLite，一个文件就是数据库，不用另装数据库服务即可运行；团队多人共用，或要接公司现成的 MySQL 时，改一行配置即可切换。
---
