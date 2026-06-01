# Travel Map Planner

一个以地图为核心的旅行路线规划工具。可以在浏览器里创建多天旅行方案，搜索地点，安排路线点、住宿点和餐饮点，查看路线，并把方案保存到本地或导出为 JSON 备份。

![Travel Map Planner 示例](docs/assets/preview-map.png)

## 快速使用

### 1. 安装依赖

```bash
npm install
```

### 2. 配置百度地图

打开 [百度地图开放平台](https://lbsyun.baidu.com/)，创建浏览器端应用，启用 JavaScript API，然后复制浏览器端 AK。

复制环境变量文件：

```bash
cp .env.example .env
```

Windows PowerShell 可以使用：

```powershell
Copy-Item .env.example .env
```

在 `.env` 里填写百度地图浏览器端 AK：

```env
VITE_BAIDU_BROWSER_AK=你的百度地图浏览器端AK
```

百度地图开放平台里需要配置 Referer 白名单，例如：

```text
http://127.0.0.1:5173/*
```

也可以启动项目后，在页面右上角的地图 API 设置里填写 AK。

### 3. 启动项目

```bash
npm run dev
```

然后打开终端里显示的访问地址，通常是：

```text
http://127.0.0.1:5173/
```

## 基本操作

1. 在控制台新建或打开旅行方案。
2. 搜索地点，把地点加入当天路线、住宿或餐饮。
3. 在左侧切换日期、调整点位顺序。
4. 点击地图上的点位或路线查看详情。
5. 点击“保存方案”保存到浏览器本地。
6. 点击导出备份 JSON，之后可以再导入继续编辑。

## 其他地图源

当前主要测试路径是百度地图。Mock 地图源和高德代理仍保留在项目里，但尚未完全测试。

## 常用命令

启动开发环境：

```bash
npm run dev
```

运行测试：

```bash
npm test
```

运行 lint：

```bash
npm run lint
```

构建生产版本：

```bash
npm run build
```

## 本地数据和备份

项目默认使用浏览器 `localStorage` 保存方案，不需要账号，也不需要后端数据库。

重要方案建议同时导出 JSON 备份。导出的 JSON 是完整可编辑数据，不是截图，之后可以通过控制台导入继续调整路线和点位。

## 技术栈

- React 19
- TypeScript
- Vite
- Vitest
- Testing Library
- Lucide React

## License

MIT
