**PROJETO**
- Roterização interna de estabelecimentos.

**INFRAESTRUTURA**
- RailWay como provedor de nuvem.
- NestJS no back-end.
- React Native para o app.

**OBSERVAÇÕES IMPORTANTES**
- Planeje com Opus, use Sonnet para explorar repositórios e executar escrita de código afim de economizar token e contexto.
- Foi verificado no teste que o sistema libera apenas 4 scanners de wifi a cada 2 minutos, planeje a aplicação para atualizar a localização a cada 30segundos.
- Faça um visual aceitável, padrão Bootstrap para mobile.

**TAREFA**
- A tela inicial deve ser uma listagem dos lugares mais proximos de você e deve permitir inserir lugares.
- Lugares que tem mapa cadastrado devem ter um botão de navegação na listagem, que irá abrir uma tela de navegação dentro dos blocos.
- O cadastro de lugar deve funcionar no modo wizard e seguir os passos que seram descritos a seguir:
    1. Deve ser possível inserir o Nome do lugar, Tipo de Lugar e Latitude e Longitude (obtidas pela localização do celular).
    2. O tipo de lugar é um Select, e caso o lugar digitado não exista  deve criá-lo.
    2. Ao cadastrar o lugar, deve ser possível montar o mapa do lugar em blocos , conforme a imagem de exemplo "blocks.png", essa tela deve ampliar e reduzir para que o usuário consiga enxergar o mapa e se realmente condiz com a estrutura fisica do mesmo.
    3. Como não é possível dar precisão de onde o usuário esta até implementarmos os beacons, a navegação deve mostrar o bloco em que o usuário está (baseando-se nos dados de rede coletados) e o nome do bloco, por exemplo: Entrada do shopping.
    4. Sempre faça o scanner dos 4 cantos do bloco para garantir o máximo de mapeamento de redes wifi, afim de garantir que o usuário realmente está naquela região.
    5. No centro do bloco mostre um indicador de direção que mostra a direção em que o usuário está olhando, se necessário peça isso na inserção do bloco, para que o usuário vire o celular para um local específico do bloco para conseguir mostrar a orientação do bloco.
- A tela de navegação deve mostrar em destaque o bloco que o usuário está e seu nome, e no centro do bloco deve estar a orientação de para onde ele está olhando.