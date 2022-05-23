const AfficheInfosParticipant = ({ par }) => {
  // console.log(par);
  return (
    <div>
      <h1>test affichage debut</h1>
      {par.map((el) => {
        console.log(el);
        return (
          <>
            <h2>{el.nom}</h2>
          </>
        );
      })}
      <h2>test affichage fin</h2>
    </div>
  );
};

export default AfficheInfosParticipant;
