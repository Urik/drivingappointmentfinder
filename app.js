const axios = require('axios');
const dotenv = require('dotenv');
const querystring = require('querystring');
const requestData = require('./requestData.json');
const searchDates = require('./searchDates.json');
const authenticator = require('./authenticator');

dotenv.config();

async function start() {
    const { cookies, verificationToken } = await authenticator.authenticate().catch(err => {
        if (err.message !== 'SEARCH_APPOINTMENT_NOT_LOADED') {
            console.log(err);
        }

        return process.exit(1);
    });
    
    const appointmentsPromises = searchDates.map(dateStr => 
        lookForDate(cookies, verificationToken, dateStr).then(response => response.data)
    );

    const appointments = (await Promise.all(appointmentsPromises)).reduce(
        (appointments, appointment) => appointments.concat(appointment), 
    []);

    console.log("Found the following appointments:");
    console.log(JSON.stringify(appointments));

    const filteredAppointments = appointments.filter(appointment => 
        searchDates.some(desiredDate => appointment.Date.includes(desiredDate))
    );
    
    const appointmentDates = filteredAppointments.map(appointment => appointment.Date);
    if (appointmentDates.length > 0) {
        const uniqueAppointments = new Set(appointmentDates);
        return sendAppointmentDates(uniqueAppointments);
    } else {
        return;
    }
}

/**
 * dateStr should be a date in the format YYYY-MM-DD
 */
async function lookForDate(cookies, verificationToken, dateStr) {
    const auxRequestData = JSON.parse(JSON.stringify(requestData)); 
    auxRequestData["__RequestVerificationToken"] = verificationToken;
    auxRequestData.AppointmentDate = `${dateStr}T06:00:00.000Z`;

    const cookiesArray = cookies.reduce((cookiesArray, cookie) => {
        cookiesArray.push(`${cookie.name}=${cookie.value}`);
        return cookiesArray;
    }, []);
    
    const cookiesString = cookiesArray.join('; ');
    const encodedRequestData = querystring.stringify(auxRequestData);
    
    const response = await axios({
        method: 'POST',
        url: process.env.SEARCH_URL,
        headers: {
            "Cookie": cookiesString,
            "Origin": process.env.ORIGIN_URL,
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en,de;q=0.9",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Length": "1401",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "Pragma": "no-cache",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": process.env.REFERER_URL,
            "X-Requested-With": "XMLHttpRequest",
            "Connection": "keep-alive",
            "Host": "onlineservices.mpi.mb.ca"
        },
        data: encodedRequestData,
        withCredentials: true
    });

    console.log("Response: ", response.data);
    return response;
}

async function sendAppointmentDates(appointmentsSet) {
    const appointmentsString = [...appointmentsSet].join('\n');
    const response = await axios.post('https://api.pushbullet.com/v2/pushes', {
        device_iden: process.env.PUSHBULLET_DEVICE_IDEN,
        type: 'note',
        title: 'Available MPI turns', 
        body: `There are available MPI turns on the following dates: ${appointmentsString}`
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Access-Token': process.env.PUSHBULLET_API_KEY
        }
    });
    console.log('Sent a notification: ');
    console.log(response.data);

    return response;
}

start();