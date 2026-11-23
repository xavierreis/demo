import { Shell } from "@/components/Shell";

const chapters: { title: string; items: (string | { text: string; list: string[] })[] }[] = [
  { title: "CAPÍTULO I – OBJECTIVOS", items: [
    "1.1. O concurso tem como principal objectivo sensibilizar os participantes, por forma a mobilizar os seus sentidos para a capacidade de observação do meio que os rodeia, valorizar competências técnicas e de criatividade no âmbito da fotografia, com ligação a outras formas de arte." ] },
  { title: "CAPÍTULO II – CONCORRENTES", items: [
    "2.1. A participação no Concurso é gratuita e aberta a qualquer participante com mais de 8 anos.",
    "2.2. Os participantes podem apresentar-se individualmente ou em grupo (até 3 pessoas).",
    "2.3. Os participantes são responsáveis pela originalidade dos trabalhos apresentados e garantem a sua autoria.",
    "2.4. Cada participante poderá apresentar uma fotografia, por categoria., num máximo de 5 fotografias por participante.",
    "2.5. A mesma fotografia poderá ser submetida a concurso em várias categorias." ] },
  { title: "CAPÍTULO III – ESPECIFICAÇÕES TÉCNICAS DE ACESSO", items: [
    { text: "3.1. Os participantes deverão apresentar as fotografias com as seguintes especificidades:", list: [
      "I – As fotografias a cor ou a preto e branco.",
      "II – As fotografias deverão ser entregues em formato digital; a organização fornece computador e um leitor de cartões xD, MS, MS MPO, MS DUO PRO, M2, micro MS, T-flash, micro SD-SDHC, SD, SHDC, MMC, miniSD e CF.",
      "III – As fotografias deverão ter o formato standard (20x30).",
      "IV – Cada fotografia deve mencionar as categorias a que concorre.",
      "V – A organização disponibiliza 2 computadores para os participantes selecionarem as suas fotografias a concurso, até 15 minutos por participante. Cada pessoa pode trazer o seu próprio computador e leitor de cartões." ] },
    "3.2. As categorias a concurso são 5: Artes plásticas; Conto/Crónica; Filme; Música e Poema; os temas serão apresentados nos 15 minutos anteriores à Largada, que se inicia às 11h locais.",
    "3.3. Todos os trabalhos submetidos a concurso devem ser completamente originais e inéditos.",
    "3.4. Não serão aceites a concurso fotografias compostas e imagens manipuladas digitalmente, assim como fotografias com qualquer outro artifício." ] },
  { title: "CAPÍTULO IV – ENTREGA DOS TRABALHOS", items: ["4.1. Os trabalhos devem ser entregues até às 13h30."] },
  { title: "CAPÍTULO V – JÚRI", items: [
    "5.1. Os 5 temas serão de novo apresentados nos 15 minutos anteriores à votação.",
    "5.2. As fotografias serão apreciadas por um júri, composto por participantes do convívio com mais de 8 anos (incluindo os participantes no concurso).",
    "5.3. O Júri atribuirá a classificação em cada categoria das fotografias a concurso.",
    "5.4. As 5 fotografias vencedoras nas 5 categorias, serão objecto de nova votação para eleição da fotografia vencedora do Grande Prémio." ] },
  { title: "CAPÍTULO VI – PRÉMIOS", items: [
    "6.1. Será atribuído o prémio de um fim-de-semana na Azenha, a definir entre o vencedor e a organização.",
    "6.2. Todos os concorrentes receberão um certificado de participação." ] },
  { title: "CAPÍTULO VII – DIREITOS DE PROPRIEDADE INTELECTUAL", items: [
    "7.1. Os concorrentes transmitem à organização os direitos autorais sobre todas as criações que apresentem no âmbito do presente concurso, para reprodução de documentos considerados pertinentes para a organização." ] },
  { title: "CAPÍTULO VIII – DISPOSIÇÕES GERAIS", items: [
    "8.1. Serão admitidos a concurso os trabalhos que respeitem o presente regulamento.",
    "8.2. Os casos omissos neste Regulamento serão resolvidos por deliberação da organização do concurso de acordo com a Lei especifica.",
    "8.3. Eventuais esclarecimentos devem ser solicitados a Fátima Laureano ou António Laureano." ] },
];

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const num = (s: string) => s.match(/^(\d+\.\d+\.)\s*(.*)$/s);

export default function RegulamentoPage() {
  return (
    <Shell>
      <h1>Regulamento do concurso de fotografia</h1>
      <nav className="card" aria-label="Índice" style={{ margin: "12px 0" }}>
        <b>Índice</b>
        <ol style={{ margin: "6px 0 0 18px" }}>
          <li><a href="#enquadramento">Enquadramento</a></li>
          {chapters.map((c) => <li key={c.title}><a href={`#${slug(c.title)}`}>{c.title.split(" – ")[0]} – {c.title.split(" – ")[1]}</a></li>)}
        </ol>
      </nav>
      <div className="rules stack">
        <section id="enquadramento">
          <h2>ENQUADRAMENTO</h2>
          <p>O concurso de fotografia é dinamizado pelas “Azenhas da Serra – Bread and Spa”. Visa o convívio dos amigos numa estrutura de arquitetura industrial e em ambiente natural.</p>
        </section>
        {chapters.map((c) => (
          <section key={c.title} id={slug(c.title)}>
            <h2>{c.title}</h2>
            {c.items.map((it, i) => {
              const text = typeof it === "string" ? it : it.text;
              const m = num(text);
              return (
                <div key={i}>
                  <p>{m ? <><b>{m[1]}</b> {m[2]}</> : text}</p>
                  {typeof it !== "string" && <ol style={{ listStyle: "none", margin: "4px 0 4px 8px" }}>{it.list.map((l) => <li key={l}>{l}</li>)}</ol>}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </Shell>
  );
}
