SITE AIB — VOTAÇÃO COM LOGIN INSTITUCIONAL

1) Firebase Console
- Authentication > Sign-in method > ativa Google.
- Authentication > Settings > Authorized domains > adiciona o domínio onde vais publicar:
  exemplo: teu-utilizador.github.io
- Firestore Database > cria a base de dados em Production Mode.
- Firestore Rules > cola o conteúdo de firestore-rules.txt.

2) Configuração do site
- Abre firebase-config.js e cola a configuração pública do teu projeto Firebase.
- Publica estes ficheiros no GitHub Pages.

3) Lista de estudantes autorizados
- Importa a coleção aib_voters_2026 com os emails institucionais em minúsculas.
- O login Google apenas sugere o domínio @aemaia.com; a segurança real está nas regras do Firestore e na lista aib_voters_2026.

4) Votação
- Cada aluno entra com Google usando o email institucional.
- Só vota se o email existir em aib_voters_2026 e active == true.
- Cada aluno só pode votar uma vez em cada projeto.
- O voto inclui produto e vídeo, ambos de 0 a 5.

5) Ficheiros dos projetos
- Coloca produto e vídeo em assets/projetos/.
- Edita script.js e preenche productUrl e videoUrl em cada projeto.

