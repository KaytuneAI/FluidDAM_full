// 这是即梦 AI 接口的完整修复代码
// 替换 /api/jimeng-ai/generate 端点的实现

// 即梦 AI 图片生成代理端点（解决 CORS 问题）
// 使用火山引擎 OpenAPI HMAC 签名认证
app.post('/api/jimeng-ai/generate', async (req, res) => {
  try {
    const { prompt, imageUrl, width, height, style, negativePrompt } = req.body

    if (!prompt) {
      return res.status(400).json({ success: false, error: '提示词不能为空' })
    }

    // 从环境变量获取火山引擎配置（使用规范的环境变量名）
    const accessKeyId = process.env.VOLC_ACCESSKEY || process.env.VOLCENGINE_ACCESS_KEY_ID || process.env.VITE_JIMENG_AI_API_KEY
    const secretKey = process.env.VOLC_SECRETKEY || process.env.VOLCENGINE_SECRET_ACCESS_KEY || process.env.VITE_JIMENG_AI_API_SECRET
    const baseUrl = process.env.VITE_JIMENG_AI_BASE_URL || process.env.JIMENG_AI_BASE_URL || 'https://visual.volcengineapi.com'
    const region = process.env.VOLC_REGION || process.env.VOLCENGINE_REGION || 'cn-north-1'

    if (!accessKeyId || !secretKey) {
      return res.status(500).json({ 
        success: false, 
        error: '火山引擎 API Key 或 Secret 未配置，请在 .env 文件中设置 VOLC_ACCESSKEY 和 VOLC_SECRETKEY' 
      })
    }

    // 构建请求体 - 火山引擎 API 格式
    const requestBody = {
      req_key: 'jimeng_t2i_v40', // 文生图4.0
      prompt: prompt,
    }

    // 如果有图片 URL，说明是图生图
    if (imageUrl) {
      if (imageUrl.startsWith('data:image')) {
        requestBody.image = imageUrl
      } else {
        try {
          const imageResponse = await fetch(imageUrl)
          const imageBlob = await imageResponse.blob()
          const imageBuffer = Buffer.from(await imageBlob.arrayBuffer())
          const imageBase64 = `data:${imageBlob.type};base64,${imageBuffer.toString('base64')}`
          requestBody.image = imageBase64
        } catch (error) {
          log('ERROR', '下载图片失败', { error: error.message })
          return res.status(400).json({ success: false, error: '图片下载失败' })
        }
      }
      requestBody.req_key = 'jimeng_i2i_v40' // 图生图4.0
    }

    if (width && height) {
      requestBody.width = width
      requestBody.height = height
    }

    if (negativePrompt) {
      requestBody.negative_prompt = negativePrompt
    }

    if (style) {
      requestBody.style = style
    }

    requestBody.seed = -1

    // 构建火山引擎 OpenAPI 请求
    const queryParams = new URLSearchParams({
      Action: 'CVSync2AsyncSubmitTask',
      Version: '2022-08-31',
    })
    const apiEndpoint = `${baseUrl}?${queryParams.toString()}`

    // 构建请求对象（Signer 需要的格式）
    const requestObj = {
      region: region,
      method: 'POST',
      pathname: '/',
      params: {
        Action: 'CVSync2AsyncSubmitTask',
        Version: '2022-08-31',
      },
      headers: {
        'Content-Type': 'application/json',
        'Region': region,
        'Service': 'cv',
      },
      body: JSON.stringify(requestBody),
    }

    // 使用 Signer 生成 HMAC 签名
    const signer = new Signer(requestObj, 'cv')
    const credentials = {
      accessKeyId: accessKeyId,
      secretAccessKey: secretKey,
    }
    signer.addAuthorization(credentials)
    const headers = requestObj.headers

    log('INFO', '调用即梦 AI API - 提交任务', { 
      endpoint: apiEndpoint,
      region,
      req_key: requestBody.req_key,
      width: requestBody.width,
      height: requestBody.height,
      hasImage: !!requestBody.image,
    })

    // 提交任务
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers,
      body: requestObj.body,
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || '请求失败' }
      }
      
      log('ERROR', '即梦 AI API 调用失败', { 
        status: response.status,
        requestId: errorData.ResponseMetadata?.RequestId,
        errorCode: errorData.ResponseMetadata?.Error?.Code,
        errorMessage: errorData.ResponseMetadata?.Error?.Message || errorData.message,
      })
      
      return res.status(response.status).json({
        success: false,
        error: errorData.ResponseMetadata?.Error?.Message || errorData.message || `HTTP error! status: ${response.status}`,
        details: {
          requestId: errorData.ResponseMetadata?.RequestId,
          code: errorData.ResponseMetadata?.Error?.Code,
          codeN: errorData.ResponseMetadata?.Error?.CodeN,
        }
      })
    }

    const submitData = await response.json()

    // 检查提交任务是否成功
    if (submitData.ResponseMetadata?.Error) {
      const error = submitData.ResponseMetadata.Error
      log('ERROR', '即梦 AI 任务提交失败', { 
        requestId: submitData.ResponseMetadata.RequestId,
        errorCode: error.Code,
        errorMessage: error.Message,
      })
      return res.json({
        success: false,
        error: error.Message || '任务提交失败',
        details: {
          requestId: submitData.ResponseMetadata.RequestId,
          code: error.Code,
          codeN: error.CodeN,
        }
      })
    }

    // 获取 task_id
    const taskId = submitData.Result?.task_id || submitData.Result?.TaskId || submitData.data?.task_id || submitData.task_id
    if (!taskId) {
      log('ERROR', '即梦 AI 响应中未找到 task_id', { response: submitData })
      return res.json({
        success: false,
        error: '任务提交成功但未返回 task_id',
        details: submitData
      })
    }

    log('INFO', '即梦 AI 任务提交成功，开始轮询结果', { taskId })

    // 轮询获取结果（方案1：后端轮询）
    const maxPollingAttempts = 20
    const pollingInterval = 1000
    let pollingAttempt = 0
    let finalResult = null

    while (pollingAttempt < maxPollingAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollingInterval))
      pollingAttempt++

      const resultQueryParams = new URLSearchParams({
        Action: 'CVSync2AsyncGetResult',
        Version: '2022-08-31',
      })
      const resultEndpoint = `${baseUrl}?${resultQueryParams.toString()}`

      const resultRequestObj = {
        region: region,
        method: 'POST',
        pathname: '/',
        params: {
          Action: 'CVSync2AsyncGetResult',
          Version: '2022-08-31',
        },
        headers: {
          'Content-Type': 'application/json',
          'Region': region,
          'Service': 'cv',
        },
        body: JSON.stringify({ task_id: taskId }),
      }

      const resultSigner = new Signer(resultRequestObj, 'cv')
      resultSigner.addAuthorization(credentials)
      const resultHeaders = resultRequestObj.headers

      try {
        const resultResponse = await fetch(resultEndpoint, {
          method: 'POST',
          headers: resultHeaders,
          body: resultRequestObj.body,
        })

        if (!resultResponse.ok) {
          log('WARN', '轮询结果请求失败', { 
            attempt: pollingAttempt,
            status: resultResponse.status,
          })
          continue
        }

        const resultData = await resultResponse.json()

        if (resultData.ResponseMetadata?.Error) {
          const error = resultData.ResponseMetadata.Error
          if (error.Code === 'Processing' || error.Message?.includes('处理中')) {
            continue
          }
          return res.json({
            success: false,
            error: error.Message || '获取结果失败',
            taskId: taskId,
            details: {
              requestId: resultData.ResponseMetadata.RequestId,
              code: error.Code,
            }
          })
        }

        const result = resultData.Result || resultData.data || resultData
        if (result.status === 'success' || result.status === 'completed' || result.image_url || result.image_base64 || result.image) {
          finalResult = result
          log('INFO', '即梦 AI 生成成功', { 
            taskId,
            pollingAttempt,
            hasImageUrl: !!result.image_url,
            hasImageBase64: !!result.image_base64,
          })
          break
        }

        if (result.status === 'processing' || result.status === 'pending') {
          continue
        }

      } catch (pollError) {
        log('WARN', '轮询请求异常', { 
          attempt: pollingAttempt,
          error: pollError.message
        })
        continue
      }
    }

    if (!finalResult) {
      log('ERROR', '即梦 AI 轮询超时', { taskId, pollingAttempt })
      return res.json({
        success: false,
        error: '任务处理超时，请稍后查询结果',
        taskId: taskId,
      })
    }

    res.json({
      success: true,
      imageUrl: finalResult.image_url || finalResult.image || finalResult.url,
      imageBase64: finalResult.image_base64 || finalResult.image,
      taskId: taskId,
    })
  } catch (error) {
    log('ERROR', '即梦 AI 代理调用失败', { error: error.message, stack: error.stack })
    res.status(500).json({
      success: false,
      error: error.message || '生成失败，请检查网络连接和 API 配置',
    })
  }
})














