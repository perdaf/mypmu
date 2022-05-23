export const afficheInfosParticipant = (par) => {
  console.log("participants", par);

  const infosparticipants = par.forEach((element, index) => (
    <p>nom : {element.nom}</p>
  ));
  console.log("infospart", infosparticipants);

  return <div>{infosparticipants}</div>;
};
