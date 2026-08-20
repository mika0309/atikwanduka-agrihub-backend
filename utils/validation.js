function trimString(value) {
    return typeof value === "string" ? value.trim() : value;
}

function isBlank(value) {
    return value === undefined || value === null || trimString(value) === "";
}

function requiredFields(body, fields) {
    return fields.filter((field) => isBlank(body[field]));
}

function toPositiveNumber(value) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue) || numberValue <= 0) {
        return null;
    }

    return numberValue;
}

function isAllowedValue(value, allowedValues) {
    return allowedValues.includes(value);
}

module.exports = {
    isAllowedValue,
    isBlank,
    requiredFields,
    toPositiveNumber,
    trimString
};
