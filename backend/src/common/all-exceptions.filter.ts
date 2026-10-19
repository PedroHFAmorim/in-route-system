import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';

// Filtro global: { error } com o status certo; 500 loga e devolve { error, detail }.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Erro');

  catch(exception: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (res.headersSent) return;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse() as any;
      let msg: any = typeof body === 'string' ? body : body?.message ?? exception.message;
      if (Array.isArray(msg)) msg = msg.join('; ');
      if (status === 404 && /^Cannot (GET|POST|PUT|DELETE|PATCH)/.test(String(msg))) msg = 'rota não encontrada';
      if (status === 429) msg = 'muitas requisições, tente novamente em instantes';
      return res.status(status).json({ error: String(msg) });
    }

    // Erros do body-parser (JSON malformado, corpo grande demais)
    const st = exception?.status ?? exception?.statusCode;
    if (typeof st === 'number' && st >= 400 && st < 500) {
      const error = st === 413 ? 'corpo grande demais (limite 10mb)' : 'corpo inválido';
      return res.status(st).json({ error });
    }

    this.log.error(exception?.stack ?? String(exception));
    res.status(500).json({ error: 'erro interno', detail: String(exception?.message ?? exception) });
  }
}
