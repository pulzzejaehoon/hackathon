import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Mock OAuth endpoint for development when no real Interactor API key is available
 */
router.get('/mock-oauth/:service', (req: Request, res: Response) => {
  const { service } = req.params;
  const { account } = req.query;

  const serviceNames = {
    googlecalendar: 'Google Calendar',
    gmail: 'Gmail', 
    googledrive: 'Google Drive'
  };

  const serviceName = serviceNames[service as keyof typeof serviceNames] || service;

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Mock OAuth - ${serviceName}</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          padding: 40px; 
          text-align: center; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .container { 
          background: white; 
          color: #333; 
          padding: 30px; 
          border-radius: 12px; 
          box-shadow: 0 10px 25px rgba(0,0,0,0.1);
          max-width: 400px;
        }
        button { 
          background: #4285f4; 
          color: white; 
          border: none; 
          padding: 12px 24px; 
          border-radius: 6px; 
          cursor: pointer; 
          font-size: 16px;
          margin: 10px;
        }
        button:hover { background: #357ae8; }
        .warning { 
          color: #ff9800; 
          background: #fff3cd; 
          padding: 15px; 
          border-radius: 6px; 
          margin-bottom: 20px;
          border: 1px solid #ffeaa7;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>🔗 Mock OAuth - ${serviceName}</h2>
        <div class="warning">
          ⚠️ <strong>개발 모드</strong><br>
          실제 Interactor API 키가 설정되지 않아 Mock 데이터를 사용합니다.
        </div>
        <p>계정: <strong>${account}</strong></p>
        <p>${serviceName} 연동을 시뮬레이션합니다.</p>
        
        <button onclick="simulateSuccess()">✅ 연동 성공 시뮬레이션</button>
        <button onclick="simulateError()">❌ 연동 실패 시뮬레이션</button>
        
        <script>
          function simulateSuccess() {
            // 부모 창에 성공 메시지 전송
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH_SUCCESS',
                service: '${service}',
                account: '${account}',
                mock: true
              }, '*');
              window.close();
            } else {
              alert('연동 성공 시뮬레이션 완료! (팝업 모드가 아님)');
            }
          }
          
          function simulateError() {
            if (window.opener) {
              window.opener.postMessage({
                type: 'OAUTH_ERROR',
                service: '${service}',
                error: 'Mock 연동 실패 시뮬레이션',
                mock: true
              }, '*');
              window.close();
            } else {
              alert('연동 실패 시뮬레이션 완료! (팝업 모드가 아님)');
            }
          }
        </script>
      </div>
    </body>
    </html>
  `);
});

export default router;